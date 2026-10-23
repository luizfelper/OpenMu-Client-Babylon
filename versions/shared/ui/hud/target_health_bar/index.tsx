import './style.less';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type Ref } from 'react';
import { Ecs } from '@/ecs/current';
import { GameOptions } from '@/controllers/settings';
import { usePositionOnScreen } from '@/controllers/interface/hooks';
import { isNpcOrTrapType } from '@/ecs/systems/attackSystem';
import type { Entity } from '@/ecs/world';

const STEPS = 20;
const BORDER_WIDTH = 2;
const WIDTH_PER_STEP = 4;
const STEP_SEPARATOR_WIDTH = 1;
const STEPS_WIDTH = STEPS * WIDTH_PER_STEP - 2 * STEP_SEPARATOR_WIDTH;
const TOTAL_WIDTH = STEPS_WIDTH + BORDER_WIDTH * 2;
const BAR_Y = 15;
const BAR_HEIGHT = 5;
const NAME_Y = 2;

/**
 * The same pieces anchored on the target instead of on the screen: the
 * projected point is already the head (`screenPosition.worldOffsetZ`), so the
 * bar sits just above it and the name above the bar.
 */
const HEAD_BAR_Y = -13;
const HEAD_NAME_Y = -28;

const FRAME_COLOUR = 'rgb(51, 0, 0)';
const TRACK_COLOUR = 'rgb(50, 10, 0)';
const FILL_COLOUR = 'rgb(250, 10, 0)';

/** `GameOptions.targetHealthBarPosition`: 0 the top of the screen / 1 over the monster. */
const TOP_OF_SCREEN = 0;

/**
 * What the panel shows: the target's name, and its health in whole steps when
 * anything knows it. `showBar` is the original's `HealthStatus > 0` - the name
 * is unconditional, the bar is not (NewUINameWindow.cpp:138-144).
 */
type Target = { entity: Entity; name: string; steps: number; showBar: boolean };

/**
 * Reads the current target into the scratch record without allocating.
 * Returns `false` when there is nothing to show.
 */
const scratch: {
  entity: Entity | null;
  name: string;
  steps: number;
  showBar: boolean;
} = { entity: null, name: '', steps: 0, showBar: false };

function readTarget(out: typeof scratch): boolean {
  const world = Ecs.world;
  if (!world) return false;

  const entity = world.currentPointerTarget ?? world.attackTarget;

  if (!entity || entity.localPlayer) return false;
  if (entity.dying) return false; // SelectedCharacter is cleared once Dead > 0

  // `Kind == KIND_MONSTER`: players and NPCs get the floating name balloon
  // instead. The animation rig is deliberately not the test - the Skeleton
  // line and the Doppelganger set are monsters drawn on the player rig, and
  // asking for `monsterAnimation` left every one of them nameless.
  const type = entity.npcType;
  if (type === undefined || isNpcOrTrapType(type)) return false;

  const name = entity.objectNameInWorld;
  if (!name) return false;

  const attributes = entity.attributeSystem;
  const max = attributes ? attributes.getValue('maxHealth') : 0;
  const current = attributes ? attributes.getValue('currentHealth') : 0;
  const health = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;

  out.entity = entity;
  out.name = name;
  out.steps = Math.trunc(health * STEPS);
  out.showBar = health > 0;
  return true;
}

/** Hoisted pip styles: the bar shows at most STEPS of them. */
const PIP_STYLES = Array.from({ length: STEPS }, (_, k) => ({
  left: BORDER_WIDTH + k * WIDTH_PER_STEP,
  top: BORDER_WIDTH,
  width: WIDTH_PER_STEP - STEP_SEPARATOR_WIDTH,
  height: 2,
  backgroundColor: FILL_COLOUR,
}));

const BAR_SIZE = { width: TOTAL_WIDTH, height: BAR_HEIGHT };
const TOP_BAR_STYLE = { ...BAR_SIZE, top: BAR_Y };
const HEAD_BAR_STYLE = { ...BAR_SIZE, top: HEAD_BAR_Y };
const TOP_NAME_STYLE = { top: NAME_Y };
const HEAD_NAME_STYLE = { top: HEAD_NAME_Y };
const FRAME_STYLE = { backgroundColor: FRAME_COLOUR };
const TRACK_STYLE = {
  left: BORDER_WIDTH,
  top: BORDER_WIDTH,
  width: STEPS_WIDTH,
  height: 1,
  backgroundColor: TRACK_COLOUR,
};

/**
 * Half the bar: how far the panel reaches either side of its anchor, and how
 * tall it is above it, so a monster at the edge of the screen still shows all.
 */
const PANEL_HALF_WIDTH = TOTAL_WIDTH / 2;
const PANEL_HEIGHT = -HEAD_NAME_Y;

/** Keeps the anchored panel on screen when the target is close to an edge. */
function keepOnScreen(point: { x: number; y: number }) {
  const minX = PANEL_HALF_WIDTH + 2;
  const maxX = Math.max(minX, window.innerWidth - PANEL_HALF_WIDTH - 2);

  point.x = Math.min(Math.max(point.x, minX), maxX);
  point.y = Math.max(point.y, PANEL_HEIGHT + 2);
}

type PanelProps = {
  name: string;
  steps: number;
  showBar: boolean;
  /** Over the monster (the anchored mode) rather than across the screen top. */
  overHead: boolean;
  panelRef?: Ref<HTMLDivElement>;
};

/**
 * The panel itself, in either position. Exported for the test that pins the
 * two layouts; the window below picks the one the player chose.
 */
export const TargetPanel = observer(function TargetPanel({
  name,
  steps,
  showBar,
  overHead,
  panelRef,
}: PanelProps) {
  return (
    <div ref={panelRef} className={`target-health-bar${overHead ? ' over-head' : ''}`}>
      <div className="target-name" style={overHead ? HEAD_NAME_STYLE : TOP_NAME_STYLE}>
        {name}
      </div>

      {showBar && (
        <div className="target-bar" style={overHead ? HEAD_BAR_STYLE : TOP_BAR_STYLE}>
          <div className="bar-shadow" />
          <div className="bar-frame" style={FRAME_STYLE} />
          <div className="bar-track" style={TRACK_STYLE} />
          {PIP_STYLES.slice(0, steps).map((style, k) => (
            <div key={k} className="bar-step" style={style} />
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * The panel pinned over the target's head. `usePositionOnScreen` writes the
 * transform every frame straight onto the element, so the bar follows a
 * walking monster without a React render.
 */
const OverHeadPanel = observer(function OverHeadPanel({ target }: { target: Target }) {
  const ref = useRef<HTMLDivElement>(null);

  usePositionOnScreen(target.entity, ref, 0, 0, keepOnScreen);

  return (
    <TargetPanel
      name={target.name}
      steps={target.steps}
      showBar={target.showBar}
      overHead
      panelRef={ref}
    />
  );
});

/**
 * The target's name and twenty-step health bar, over the monster's head or
 * across the screen centre (`targetHealthBarPosition`). The pointer target is
 * plain per-frame state, so it is polled once a frame - into a reused record,
 * and React only hears about it when the target, the name or the step count
 * actually changes.
 */
export const TargetHealthBar = observer(() => {
  const [target, setTarget] = useState<Target | null>(null);
  const overHead = GameOptions.targetHealthBarPosition !== TOP_OF_SCREEN;

  useEffect(() => {
    let frame = 0;
    let shown: Target | null = null;

    const poll = () => {
      frame = requestAnimationFrame(poll);

      if (!readTarget(scratch)) {
        if (shown) {
          shown = null;
          setTarget(null);
        }
        return;
      }

      const entity = scratch.entity;
      if (!entity) return;

      if (
        shown &&
        shown.entity === entity &&
        shown.name === scratch.name &&
        shown.steps === scratch.steps &&
        shown.showBar === scratch.showBar
      ) {
        return;
      }

      shown = {
        entity,
        name: scratch.name,
        steps: scratch.steps,
        showBar: scratch.showBar,
      };
      setTarget(shown);
    };

    frame = requestAnimationFrame(poll);

    return () => cancelAnimationFrame(frame);
  }, []);

  if (!target) return null;

  if (!overHead) {
    return (
      <TargetPanel
        name={target.name}
        steps={target.steps}
        showBar={target.showBar}
        overHead={false}
      />
    );
  }

  return <OverHeadPanel target={target} />;
});
