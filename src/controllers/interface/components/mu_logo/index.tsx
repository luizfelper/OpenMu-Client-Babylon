import './style.less';
import { useUiStageScale } from '../ui_stage';

/**
 * MUCURA's wordmark above the login window. The original drew the version's
 * MU-logo sprite at 0.8 of its 256×128 sheet; the new mark is a wide web
 * asset, so it is laid out in the same 640×480 stage units but at its own
 * proportions.
 */

const LOGO_ART = '/ui/world_select/mucura.webp';
const LOGO_TOP = 45;
const LOGO_WIDTH = 480;
const LOGO_HEIGHT = 160;

export const MuLogo = ({ top = LOGO_TOP }: { top?: number }) => {
  const stageScale = useUiStageScale();

  return (
    <div
      className="mu-logo"
      style={{
        top: top * stageScale,
        width: LOGO_WIDTH * stageScale,
        height: LOGO_HEIGHT * stageScale,
      }}
    >
      <img className="mu-logo-art" src={LOGO_ART} alt="MUCURA" draggable={false} />
    </div>
  );
};
