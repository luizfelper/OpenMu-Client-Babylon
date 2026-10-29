// <copyright file="VipTierStore.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using MUnique.OpenMU.Persistence.EntityFramework;
using Npgsql;

/// <summary>
/// The VIP plans, in tables of our own in OpenMU's database (so OpenMU's own backup carries them):
/// <c>mu_plugins.vip_plan</c> holds a plan's multipliers, <c>mu_plugins.vip_plan_account</c> the
/// account on a plan and when it ends. The site's admin panel writes both, in the same request that
/// saves a plan, so a change or an expiry reaches the game within <see cref="CacheLifetime"/>.
/// </summary>
/// <remarks>
/// Two reads per refresh, cached for a few seconds: cheap enough to sit behind a kill, and a plan
/// change does not need a server restart. A database that is down costs nothing: the kill runs with
/// the game's own rates and the next read tries again.
/// </remarks>
public sealed class VipTierStore
{
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(15);

    private readonly object _sync = new();

    private IReadOnlyDictionary<string, VipPlanTier> _plans = new Dictionary<string, VipPlanTier>(StringComparer.OrdinalIgnoreCase);

    private IReadOnlyDictionary<string, string> _accounts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    private DateTime _loadedAtUtc = DateTime.MinValue;

    private string? _connectionString;

    private VipTierStore()
    {
    }

    /// <summary>Gets the store of this process.</summary>
    public static VipTierStore Instance { get; } = new();

    /// <summary>OpenMU's admin connection, read the way OpenMU reads it (ConnectionSettings.xml, DB_HOST, DB_ADMIN_PW).</summary>
    private string ConnectionString => this._connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <summary>The plan currently applying to an account, or <c>null</c> for a free account.</summary>
    public static VipPlanTier? TierFor(string account)
    {
        try
        {
            return Instance.Lookup(account);
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>Reads the plans and the account plans now, ignoring the cache.</summary>
    public void Reload()
    {
        using var connection = new NpgsqlConnection(this.ConnectionString);
        connection.Open();

        var plans = new Dictionary<string, VipPlanTier>(StringComparer.OrdinalIgnoreCase);
        using (var command = new NpgsqlCommand("SELECT id, xp_multiplier, master_xp_multiplier, drop_multiplier, zen_multiplier FROM mu_plugins.vip_plan", connection))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                var plan = new VipPlanTier(
                    reader.GetString(0),
                    reader.GetDecimal(1),
                    reader.GetDecimal(2),
                    reader.GetDecimal(3),
                    reader.GetDecimal(4));
                plans[plan.Id] = plan;
            }
        }

        var accounts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        using (var command = new NpgsqlCommand("SELECT account, plan_id FROM mu_plugins.vip_plan_account WHERE expires_at > now()", connection))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                accounts[reader.GetString(0)] = reader.GetString(1);
            }
        }

        lock (this._sync)
        {
            this._plans = plans;
            this._accounts = accounts;
            this._loadedAtUtc = DateTime.UtcNow;
        }
    }

    private VipPlanTier? Lookup(string account)
    {
        if (DateTime.UtcNow - this._loadedAtUtc > CacheLifetime)
        {
            this.Reload();
        }

        lock (this._sync)
        {
            return this._accounts.TryGetValue(account, out var planId) && this._plans.TryGetValue(planId, out var plan)
                ? plan
                : null;
        }
    }
}
