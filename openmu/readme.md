# openmu

Our plugins for OpenMU. We do not ship or fork OpenMU: the installer runs OpenMU the OpenMU way (its
repository at a release tag, its `deploy/all-in-one` compose, the official `munique/openmu` image),
and this folder adds one thin layer on top.

## What is here

```
plugins/            MuPlugins.csproj: one DLL with every plugin, compiled against the image's own assemblies
  StartupHook.cs    loads the DLL before OpenMU starts (DOTNET_STARTUP_HOOKS), so its plugin discovery finds it
  GameLogic/        marketplace escrow: token check, item and Zen moves (EscrowToken, MarketplaceEscrowAction);
                    Modules/IModulePacketPlugIn and Views/Modules/IModulePacketViewPlugIn (module packets);
                    LoginTokens/: the token table, issue and token login, the upkeep task; Views/LoginTokens
  GameLogic/Vip/    the VIP plans: VipTierStore reads mu_plugins.vip_plan and mu_plugins.vip_plan_account,
                    VipPlayerAttributesPlugIn applies the plan's XP, Master XP and zen multipliers
                    to a player in the world
  Web/Vip/          AccountDeletionController: DELETE api/mu-plugins/accounts/{login}, operator only,
                    deletes an account with every character (see "Deleting an account")
  GameServer/       packet group 0xE7: the group handler, the escrow request handler, the result view,
                    the login token handlers (03, 05) and view (04);
                    the module packet 0xE8: ModulePacketHandlerPlugIn and ModulePacketViewPlugIn
Dockerfile          FROM the OpenMU image, + plugins/ in /app/plugins, + the startup hook
appsettings.Production.json   adds a compact JSON log (logs/events-*.jsonl) that ops/server reads
```

## How it works

- OpenMU's `PlugInManager` registers every `[PlugIn]` type in the loaded assemblies. The startup hook
  loads our DLL first, so our plugins register like built-in ones and show in the admin panel
  (Packet Handlers: "Marketplace Group Handler", "Marketplace Escrow Request Handler", "Module Packet
  Handler", "Login Token Request Handler", "Token Login Handler"; view plugins: "Marketplace Escrow
  Result", "Module Packet", "Login Token"; periodic task: "Login Token Upkeep").
- OpenMU's own external-assembly option (`ExternalAssemblyName`) loads `plugins\<name>`, a relative
  Windows path, and fails in the Linux image; the startup hook avoids it.
- A plugin outside OpenMU sees only public types. `MarketplaceGroupHandler` repeats the few lines of
  OpenMU's internal `GroupPacketHandlerPlugIn`; the result view reads the internal
  `RemotePlayer.Connection` once by reflection and fails loudly if OpenMU renames it.

Marketplace escrow: the client sends a token the marketplace service signed (`C1 len E7 01 <token>`).
The plugin checks signature, expiry, account and character, then moves an item between the bag and
an escrow box (an `ItemStorage` owned by nobody), or pays out the Zen waiting in a box. It answers
`C1 len E7 02 op status listingId boxId amount itemLen item`. Config: `MARKETPLACE_ESCROW_SECRET`, the
same value the marketplace service has; without it every token is refused.

Module packets (phase 4 of [docs/module_streaming.md](../docs/module_streaming.md)): a client module's
packets travel inside one code, `0xE8`, in both directions: `C1 len E8 idLength id payload`, or C2
(two length bytes) when the frame does not fit 255 bytes, the client's `src/modules/_api/packetWire.ts`.

- `ModulePacketHandlerPlugIn` (a packet handler for 0xE8, no encryption expected) drops every frame
  until the player's character is in the world (the login and character screens, a disconnect; a
  trade, a dialog or death still count as in the world), then reads the module id
  and hands the payload to the `IModulePacketPlugIn` whose `Key` is that id, found with
  `PlugInManager.GetStrategy` the way OpenMU finds chat commands. `IModulePacketPlugIn` is a plugin
  point (`IStrategyPlugIn<string>`): a module's server half is a `[PlugIn]` class implementing it, with
  `HandlePacketAsync(player, payload)`. A frame for an id with no plugin (or a malformed one) is
  dropped; each such id is logged once (the first 64). No module ships yet, so nothing is registered
  and every frame is dropped.
- `ModulePacketViewPlugIn` (`IModulePacketViewPlugIn`) sends one player a module's frame:
  `player.InvokeViewPlugInAsync<IModulePacketViewPlugIn>(p => p.SendModulePacketAsync(id, payload))`.
  It refuses an id that is not a module id and a frame over 65535 bytes, and writes C1 or C2 by the
  same rule as the client. Like the escrow result view, it reads `RemotePlayer.Connection` by
  reflection.
- Nothing to switch: the handler and the view are in the DLL every installed server runs, and the
  client's router is in every client; with no module plugin they do nothing.

Login tokens (phase 6 of [docs/module_streaming.md](../docs/module_streaming.md), the wire there): the
web client's saved login, so no password is kept in a browser.

- `LoginTokenStore`: the table `mu_plugins.login_token` in OpenMU's database (our own schema),
  through OpenMU's admin connection as OpenMU reads it (`ConnectionSettings.xml`, `DB_HOST`,
  `DB_ADMIN_PW`) and OpenMU's own Npgsql. A row is a token's SHA-256, the account id, the issue time
  and a SHA-256 of the account's password hash at issue: the token itself is never stored, and a
  password change voids every token of the account. 30 days, at most 10 per account. Backups: the
  table is in the database `mu backup` dumps (`openmu.dump`).
- `LoginTokenAction`: E7 03 issues a token at the character list (once per connection); E7 05 logs in
  with one, step for step as OpenMU's `LoginAction` (v0.9.10), then replaces it and sends the new one
  (E7 04) behind the login result. `LoginAction` holds the state machine's lock across the login
  server call through a context whose `Allowed` setter is internal; the plugin checks the transition
  first, makes it last, and logs the account off the login server if it then fails.
- `LoginTokenUpkeepPlugIn` (a periodic task): creates the table at start when it is missing and
  drops expired tokens hourly. The store creates it on first use too.
- The client offers tokens only on a world whose `server.json` says `loginTokens: true`; the
  installer writes that, since this DLL is in every image it builds.

## VIP plans

The site's admin panel (VIP > planos) owns the plans and the account on each one; the game only
reads them, from two tables of our own in OpenMU's database:

- `mu_plugins.vip_plan`: one row per plan with `xp_multiplier`, `master_xp_multiplier`,
  `drop_multiplier` and `zen_multiplier`. The site writes every row on each save of the plans, so
  a change reaches the game within 15 seconds (the store's cache) and no restart is needed.
- `mu_plugins.vip_plan_account`: `account`, `plan_id`, `expires_at`. The site writes it when a
  payment is approved and again whenever the player opens the panel, so a failed write is retried;
  an expired row is ignored by the game without a task.

The hook: `VipPlayerAttributesPlugIn` (`IPlayerStateChangedPlugIn`) runs when a character enters the
world and adds the plan's rates to the attributes OpenMU already multiplies into the reward:
`Stats.ExperienceRate`, `Stats.MasterExperienceRate` and `Stats.MoneyAmountRate`. It follows
OpenMU's own `HappyHourPlugIn`, which is the supported way to change a rate for one player without
touching the shared configuration; the elements are removed when the player leaves, so no bonus
outlives the session. A free account gets nothing added. A database that is down costs nothing:
the player runs with the game's own rates until the next read works.

The plan's `jewel_drop_percent` (default 5 on every plan, set in the site's admin) is the chance of one
extra jewel (Bless, Soul or Life) per monster the VIP player kills: `VipJewelDropPlugIn`
(`IAttackableGotKilledPlugIn`) rolls it and drops the jewel where the monster died, owned like the
monster's own drops. It is an extra drop, not a multiplier of the monster's drop groups.

The site is the only place the chances are edited. It also writes a summary of them ("VIP Bronze: 5% |
...") into this plug-in's configuration (`PlansSummary`, in `config."PlugInConfiguration"`, the row of
the plug-in's `[Guid]`), so the admin panel's plug-in screen shows each plan's chance. The game reads
the chances from `mu_plugins.vip_plan`, not from that summary, and saving the plug-in's screen in the
admin panel overwrites the summary until the next plan save on the site.

The plan's `drop_multiplier` is stored, shown to players and editable, but **not applied by the
game**. OpenMU rolls a monster's drop groups inside `DefaultDropGenerator`, and its only per-kill
hooks (`IMonsterItemDropPlugIn`, `IMonsterItemDroppedPlugIn`) receive the result and can cancel a
drop, not multiply its chance; `GenerateItemDropsAsync` is not virtual either, so a subclass cannot
take part. Applying it needs one of two things in OpenMU itself: a chance attribute on the player
(e.g. `Stats.DropChanceRate`) read by the generator, or a `virtual` roll hook. Until then the site
should describe drop as a non-applied benefit, or a server owner sets the drop in the monster
definitions for everyone.

## Deleting an account

The admin panel has no delete button for an account, and the panel's Blazor router only walks
OpenMU's own assembly, so a page from this DLL would never be routed. The button lives in the
site's admin instead (`/admin` > Jogadores > Excluir conta), which calls the game database
directly: search by login or e-mail, confirm, and the account row goes. The schema already
cascades (`onDelete: Cascade` on `FK_Character_Account_AccountId`, and from a character to its
inventory, warehouse, quests and the rest), so the characters and their data go with it.

`AccountDeletionController` exposes the same operation as an HTTP endpoint for scripts and for a
future OpenMU page: `DELETE /api/mu-plugins/accounts/{loginName}`. OpenMU's
`GenericControllerFeatureProvider` discovers it because the DLL is loaded; it answers `200` with
the login and the character count, `404` for an unknown account, and is operator only (cookie or
API key, the same pair the admin panel's own account controller requires).

## Change it

- add a plugin: a new `[PlugIn]` class under `plugins/`, public OpenMU types only. Rebuild with
  `mu update` (or `docker build -t mu-openmu:local openmu`).
- another OpenMU version: `mu config` > OpenMU version. The DLL is recompiled against that image, so
  an API change shows up as a build error, not at run time.
- a database newer than the last release: `mu config` > OpenMU version > the latest main branch (each
  `mu update` takes OpenMU's newest commit) or a fixed commit or tag; OpenMU's own
  `src/Startup/Dockerfile` builds the base image.

## Tests

Built and run by the installer's end-to-end run: the plugins appear active in
`config."PlugInConfiguration"` and `logs/events-*.jsonl` is written. Its `check`
(`install/cli/loginCheck.ts`) plays the game as the test GM: module frames dropped before the world
and read in it, and the login tokens (issue, token login reaching the character list, the replaced
and a junk token refused, the new one working). Nothing here is compiled outside the image.
