// <copyright file="VipDropGenerator.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.GameLogic;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// OpenMU's own <c>DefaultDropGenerator</c>, selected as the game's drop generator in the server
/// configuration, so the plan of the killing player is known when the chance groups are rolled.
/// OpenMU picks the generator through <c>PlugInManager.GetStrategy&lt;IDropGenerator&gt;(key)</c>;
/// the empty key is this plugin and the admin can fall back to the default one at any time.
/// </summary>
/// <remarks>
/// <see cref="DefaultDropGenerator"/> fills <c>_chanceDropGroups</c> and rolls them inside one call,
/// without a hook in between, so the chance multiplier is applied by scaling each group for the
/// length of that call and putting it back right after. The lock inside the base method makes that
/// safe: one call at a time touches the shared, per-monster group objects.
/// </remarks>
[PlugIn]
[Display(Name = "VIP Drops", Description = "OpenMU's default drop generator with the killed player's VIP plan applied to drop chance and zen.")]
[Guid("0e7a4c31-b58d-4b6f-8f2a-6c1d9e3b7a52")]
public class VipDropGenerator : DefaultDropGenerator
{
    /// <summary>Initializes a new instance of the <see cref="VipDropGenerator"/> class.</summary>
    /// <param name="config">The game configuration, with the drop groups and money amounts.</param>
    /// <param name="randomizer">The randomizer of the game server.</param>
    public VipDropGenerator(GameConfiguration config, IRandomizer randomizer)
        : base(config, randomizer)
    {
    }

    /// <inheritdoc />
    public override async ValueTask<(IEnumerable<Item> Items, uint? Money)> GenerateItemDropsAsync(MonsterDefinition monster, int gainedExperience, Player player)
    {
        if (VipTierStore.TierFor(player.Account?.LoginName ?? string.Empty) is not { } tier)
        {
            return await base.GenerateItemDropsAsync(monster, gainedExperience, player).ConfigureAwait(false);
        }

        // Before a kill the groups still hold their configured values, so they can be scaled now;
        // the base method copies them into its own chance list. Restore them either way.
        var groups = monster.DropItemGroups;
        var before = groups?.Select(group => group.Chance).ToList() ?? [];
        try
        {
            if (groups is not null && tier.DropMultiplier > 1)
            {
                for (var i = 0; i < groups.Count; i++)
                {
                    groups[i].Chance = Math.Min(1.0, before[i] * (double)tier.DropMultiplier);
                }
            }

            var (items, money) = await base.GenerateItemDropsAsync(monster, gainedExperience, player).ConfigureAwait(false);
            if (money is null || tier.ZenMultiplier <= 1)
            {
                return (items, money);
            }

            return (items, (uint)Math.Min(uint.MaxValue, money.Value * (double)tier.ZenMultiplier));
        }
        finally
        {
            if (groups is not null)
            {
                for (var i = 0; i < groups.Count; i++)
                {
                    groups[i].Chance = before[i];
                }
            }
        }
    }
}
