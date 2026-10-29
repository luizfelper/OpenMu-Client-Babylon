// <copyright file="VipPlayerAttributesPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using MUnique.OpenMU.AttributeSystem;
using MUnique.OpenMU.GameLogic.Attributes;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;
using Microsoft.Extensions.Logging;

/// <summary>
/// Applies a VIP plan's multipliers to the attributes OpenMU already reads when it pays experience,
/// master experience and zen. The attributes belong to the character, so the plan affects that
/// player only, and the elements are removed when the player leaves the world, so nothing outlives
/// the session.
/// </summary>
/// <remarks>
/// This follows OpenMU's own temporary multiplier, <c>HappyHourPlugIn</c>: a
/// <see cref="SimpleElement"/> with <see cref="AggregateType.Multiplicate"/>. A rate of 1 is the game's
/// own value, so a plan's 2 doubles the gain. <c>AddElement</c> does not check for a duplicate, so the
/// elements are always removed before they are added.
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
    public ValueTask PlayerStateChangedAsync(Player player, State previousState, State currentState)
    {
        try
        {
            if (!IsInGame(currentState))
            {
                this.Remove(player);
                return ValueTask.CompletedTask;
            }

            // Map changes, deaths, trades and dialogs keep the elements already applied: only the
            // move into the world from outside the game applies them.
            if (currentState != PlayerState.EnteredWorld || IsInGame(previousState))
            {
                return ValueTask.CompletedTask;
            }

            if (VipTierStore.TierFor(player.Account?.LoginName ?? string.Empty) is not { } tier || player.Attributes is null)
            {
                return ValueTask.CompletedTask;
            }

            this.Remove(player);
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

    /// <summary>The states in which the character is in the game world, so a plan applies there.</summary>
    private static bool IsInGame(State state)
    {
        return state == PlayerState.EnteredWorld
               || state == PlayerState.ChangingMap
               || state == PlayerState.Dead
               || state == PlayerState.NpcDialogOpened
               || state == PlayerState.PartyRequest
               || state == PlayerState.GuildRequest
               || state == PlayerState.TradeRequested
               || state == PlayerState.TradeOpened
               || state == PlayerState.TradeButtonPressed;
    }

    private void Remove(Player player)
    {
        player.Attributes?.RemoveElement(this._experience, Stats.ExperienceRate);
        player.Attributes?.RemoveElement(this._masterExperience, Stats.MasterExperienceRate);
        player.Attributes?.RemoveElement(this._money, Stats.MoneyAmountRate);
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
