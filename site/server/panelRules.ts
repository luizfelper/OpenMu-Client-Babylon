/** The panel's extra actions follow the admin setting; account/logout never do. */
export function panelAllowed(vipActive: boolean, vipOnly: boolean): boolean {
  return !vipOnly || vipActive;
}
