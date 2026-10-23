const LOGO_ART = '/ui/world_select/mucura.webp';

/**
 * The start screen's wordmark. The old mark was a tall sprite with separate
 * glow, bloom and spark layers; the MUCURA mark already carries its own fire,
 * so it is one image and a soft drop shadow.
 */
export const LogoLight = () => (
  <div className="ws-logo">
    <img className="ws-logo-art" src={LOGO_ART} alt="MUCURA" draggable={false} />
  </div>
);
