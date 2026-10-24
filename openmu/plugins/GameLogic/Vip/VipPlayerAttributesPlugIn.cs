// <copyright file="VipPlayerAttributesPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using MUnique.OpenMU.AttributeSystem;
using MUnique.OpenMU.GameLogic.Attributes;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Applies a VIP plan's multipliers to the attributes OpenMU already reads when it pays experience,
/// master experience and zen. The attributes belong to the character, so the plan affects that
/// player only, and the elements are removed when the player leaves, so nothing outlives the
/// session.
/// </summary>
/// <remarks>
/// This follows OpenMU's own temporary multiplier, <c>HappyHourPlugIn</c>: a
/// <see cref="SimpleElement"/> with <see cref="AggregateType.Multiplicate"/> added when the player
/// enters the world and removed when it leaves. A rate of 1 is the game's own value, so a plan's 2
/// doubles the gain.
/// </remarks>
[PlugIn]
[Display(Name = "VIP Player Attributes", Description = "Applies the VIP plan's XP, Master XP and zen multipliers to a player in the world.")]
[Guid("c2b7e4a1-9d38-4f6b-a1c5-7e0d4b9f2a63")]
public class VipPlayerAttributesPlugIn : IPlayerStateChangedPlugIn
{
    /// <summary>One element per rate, so each can be removed on its own when the player leaves.</summary>
    private readonly SimpleElement _experience = new(1.0f, AggregateType.Multiplicate);

    private readonly SimpleElement _masterExperience = new(1.0f, AggregateType.Multiplicate);

    private readonly SimpleElement _money = new(1.0f, AggregateType.Multiplicate);

    /// <inheritdoc />
    public ValueTask PlayerStateChangedAsync(Player player, PlayerState previousState, PlayerState currentState)
    {
        try
        {
            if (currentState.IsDisconnectedOrFinished())
            {
                player.Attributes?.RemoveElement(this._experience, Stats.ExperienceRate);
                player.Attributes?.RemoveElement(this._masterExperience, Stats.MasterExperienceRate);
                player.Attributes?.RemoveElement(this._money, Stats.MoneyAmountRate);
            }

            if (previousState != PlayerState.CharacterSelection || currentState != PlayerState.EnteredWorld)
            {
                return ValueTask.CompletedTask;
            }

            if (VipTierStore.TierFor(player.Account?.LoginName ?? string.Empty) is not { } tier || player.Attributes is null)
            {
                return ValueTask.CompletedTask;
            }

            this.Set(player, this._experience, Stats.ExperienceRate, tier.XpMultiplier);
            this.Set(player, this._masterExperience, Stats.MasterExperienceRate, tier.MasterXpMultiplier);
            this.Set(player, this._money, Stats.MoneyAmountRate, tier.ZenMultiplier);
        }
        catch (Exception ex)
        {
            player.Logger.LogDebug(ex, "Unexpected error applying the VIP plan.");
        }

        return ValueTask.CompletedTask;
    }

    /// <summary>Sets the element to the plan's rate and adds it, unless the plan leaves the rate alone.</summary>
    private void Set(Player player, SimpleElement element, AttributeDefinition attribute, decimal multiplier)
    {
        if (multiplier <= 1)
        {
            return;
        }

        element.Value = (float)multiplier;
        player.Attributes!.AddElement(element, attribute);
    }
}
