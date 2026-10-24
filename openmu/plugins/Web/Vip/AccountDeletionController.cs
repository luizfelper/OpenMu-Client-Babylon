// <copyright file="AccountDeletionController.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.Web.Vip;

using System.Threading;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.Persistence;

/// <summary>
/// Deletes an account with everything it owns: characters, inventory, warehouse, quest state and
/// the references that point at them. The database already cascades from <c>Character</c> to its
/// own tables (<c>onDelete: Cascade</c> on <c>FK_Character_Account_AccountId</c>), so deleting the
/// account row is enough; this endpoint is the missing button for it.
/// </summary>
/// <remarks>
/// Operator only, like creating or editing an account in the admin panel. The endpoint is
/// discovered by the admin panel's <c>GenericControllerFeatureProvider</c> because it lives in a
/// loaded assembly, exactly like the account registration endpoint.
/// </remarks>
// Operator only, like creating or editing an account in the admin panel. AdminPolicies and
// ApiKeyAuthenticationDefaults are internal to OpenMU's web assembly, so their two values are
// spelled out: the cookie scheme plus the API key scheme, and the operator policy.
[ApiController]
[Route("api/mu-plugins/accounts")]
[Authorize(AuthenticationSchemes = "Cookies,OpenMU.ApiKey", Policy = "OpenMU.Operator")]
public class AccountDeletionController : ControllerBase
{
    private readonly IPersistenceContextProvider _persistenceContextProvider;
    private readonly IDataSource<GameConfiguration> _gameConfigurationSource;
    private readonly ILogger<AccountDeletionController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="AccountDeletionController"/> class.
    /// </summary>
    /// <param name="persistenceContextProvider">The persistence context provider.</param>
    /// <param name="gameConfigurationSource">The source of the game configuration.</param>
    /// <param name="logger">The logger.</param>
    public AccountDeletionController(
        IPersistenceContextProvider persistenceContextProvider,
        IDataSource<GameConfiguration> gameConfigurationSource,
        ILogger<AccountDeletionController> logger)
    {
        this._persistenceContextProvider = persistenceContextProvider;
        this._gameConfigurationSource = gameConfigurationSource;
        this._logger = logger;
    }

    /// <summary>
    /// Deletes one account by login name, with every character it has.
    /// </summary>
    /// <param name="loginName">The login name of the account.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns><c>200</c> when it was deleted, <c>401</c> without the API key, <c>404</c> when no such account exists.</returns>
    [HttpDelete("{loginName}")]
    public async Task<IActionResult> DeleteAsync(string loginName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(loginName))
        {
            return this.BadRequest();
        }

        var gameConfiguration = await this._gameConfigurationSource.GetOwnerAsync(Guid.Empty, cancellationToken).ConfigureAwait(false);
        using var context = this._persistenceContextProvider.CreateNewPlayerContext(gameConfiguration);
        if (await context.GetAccountByLoginNameAsync(loginName, cancellationToken).ConfigureAwait(false) is not { } account)
        {
            return this.NotFound();
        }

        var characterCount = account.Characters?.Count ?? 0;
        if (!await context.DeleteAsync(account).ConfigureAwait(false)
            || !await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false))
        {
            return this.StatusCode(StatusCodes.Status500InternalServerError);
        }

        this._logger.LogWarning(
            "Account {LoginName} with {CharacterCount} character(s) was deleted by {Operator}.",
            account.LoginName,
            characterCount,
            this.User.Identity?.Name);
        return this.Ok(new { loginName = account.LoginName, characters = characterCount });
    }
}
