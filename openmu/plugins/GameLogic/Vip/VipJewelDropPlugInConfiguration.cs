// <copyright file="VipJewelDropPlugInConfiguration.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.ComponentModel.DataAnnotations;

/// <summary>
/// The configuration shown in the admin panel's plug-in screen. The chances are edited on the site
/// (the plans are its data); the site writes a summary of them here so the admin panel can show the
/// values each plan has. The game reads the chances from the plan table, not from this summary.
/// </summary>
public class VipJewelDropPlugInConfiguration
{
    /// <summary>Gets or sets the plans and their extra jewel chance, written by the site. Read-only in practice.</summary>
    [Display(Name = "Planos VIP (editado no site)", Description = "Chance de jóia extra por monstro de cada plano. Altere no site.")]
    public string PlansSummary { get; set; } = string.Empty;
}
