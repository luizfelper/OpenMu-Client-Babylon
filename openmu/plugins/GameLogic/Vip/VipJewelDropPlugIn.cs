// <copyright file="VipJewelDropPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.DataModel.Configuration.Items;
using MUnique.OpenMU.GameLogic.NPC;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Gives a VIP player an extra jewel now and then: when a monster the player killed dies, the plan's
/// <see cref="VipPlanTier.JewelDropPercent"/> is the chance of one more jewel on the ground, the same
/// way OpenMU drops items. OpenMU has no per-player drop chance, so this is an extra drop, not a
/// multiplier of the monster's own drop groups.
/// </summary>
/// <remarks>
/// The jewel is dropped where the monster died, owned like the monster's own drops (the party if the
/// player has one). Summons, destructibles and castle objects do not drop it. A database that is down
/// costs nothing: the kill drops nothing extra until the next read works.
/// </remarks>
[PlugIn]
[Display(Name = "VIP Jewel Drop", Description = "Drops an extra jewel for a VIP player when a monster dies, at the plan's chance.")]
[Guid("8f1d3c52-6a4e-4b7d-9e21-3c5a7f0b9d14")]
public class VipJewelDropPlugIn : IAttackableGotKilledPlugIn, ISupportCustomConfiguration<VipJewelDropPlugInConfiguration>, ISupportDefaultCustomConfiguration
{
    /// <summary>Jewel of Bless, Jewel of Soul and Jewel of Life (item group 14).</summary>
    private static readonly (byte Group, short Number)[] ExtraJewels = [(14, 13), (14, 14), (14, 16)];

    /// <inheritdoc />
    public VipJewelDropPlugInConfiguration? Configuration { get; set; }

    /// <inheritdoc />
    public object CreateDefaultConfig() => new VipJewelDropPlugInConfiguration();

    /// <inheritdoc />
    public async ValueTask AttackableGotKilledAsync(IAttackable killed, IAttacker? killer)
    {
        try
        {
            if (killed is not AttackableNpcBase npc
                || npc.IsSummonedMonster
                || npc.Definition.ObjectKind != NpcObjectKind.Monster)
            {
                return;
            }

            if (killer is not Player player || player.Account is null)
            {
                return;
            }

            var percent = VipTierStore.TierFor(player.Account.LoginName)?.JewelDropPercent ?? 0;
            if (percent <= 0 || Random.Shared.NextDouble() * 100 >= (double)percent)
            {
                return;
            }

            if (PickJewel(player) is not { } definition)
            {
                return;
            }

            var item = new TemporaryItem { Definition = definition };
            item.Durability = item.GetMaximumDurabilityOfOnePiece();
            var owners = player.Party?.PartyList.AsEnumerable() ?? player.GetAsEnumerable();
            var dropped = new DroppedItem(item, npc.Position, npc.CurrentMap, null, owners);
            await npc.CurrentMap.AddAsync(dropped).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            (killer as Player)?.Logger.LogDebug(ex, "Dropping the VIP jewel failed.");
        }
    }

    private static ItemDefinition? PickJewel(Player player)
    {
        var configuration = player.GameContext.Configuration;
        var candidates = new List<ItemDefinition>(ExtraJewels.Length);
        foreach (var (group, number) in ExtraJewels)
        {
            var definition = configuration.Items.FirstOrDefault(i => i.Group == group && i.Number == number);
            if (definition is not null)
            {
                candidates.Add(definition);
            }
        }

        return candidates.Count == 0 ? null : candidates[Random.Shared.Next(candidates.Count)];
    }
}
