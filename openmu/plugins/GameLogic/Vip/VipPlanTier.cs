// <copyright file="VipPlanTier.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

/// <summary>
/// What one VIP plan changes in the game. A multiplier of 1 leaves the game's own calculation alone;
/// above 1 it multiplies the value (2 means "twice as much"). Capped at 100 by the site's validation.
/// <see cref="JewelDropPercent"/> is a chance in percent (0 to 100) for one extra jewel per kill.
/// </summary>
public sealed record VipPlanTier(
    string Id,
    decimal XpMultiplier,
    decimal MasterXpMultiplier,
    decimal DropMultiplier,
    decimal ZenMultiplier,
    decimal JewelDropPercent);
