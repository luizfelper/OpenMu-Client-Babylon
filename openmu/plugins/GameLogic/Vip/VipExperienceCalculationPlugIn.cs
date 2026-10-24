// <copyright file="VipExperienceCalculationPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Scales the experience a VIP account gains from a kill by its plan's multiplier. OpenMU applies
/// the maps', monsters' and the configured experience rates first and calls this hook last, so the
/// plan multiplies the final value; the master experience uses the plan's own multiplier.
/// </summary>
[PlugIn]
[Display(Name = "VIP Experience", Description = "Multiplies the experience a VIP account gains by its plan's XP and Master XP multipliers.")]
[Guid("c2b7e4a1-9d38-4f6b-a1c5-7e0d4b9f2a63")]
public class VipExperienceCalculationPlugIn : IExperienceCalculationPlugIn
{
    /// <inheritdoc />
    public ValueTask CalculateExperienceAsync(Player player, ExperienceCalculationArgs args)
    {
        if (VipTierStore.TierFor(player.Account?.LoginName ?? string.Empty) is { } tier)
        {
            args.Experience *= (double)(args.IsMasterExperience ? tier.MasterXpMultiplier : tier.XpMultiplier);
        }

        return ValueTask.CompletedTask;
    }
}
