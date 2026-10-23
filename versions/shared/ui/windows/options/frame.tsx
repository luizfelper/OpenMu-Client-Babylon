export const TOP_HEIGHT = 65;
export const BOTTOM_HEIGHT = 43;

/**
 * The options window's chrome. The original stitched four sprite bands
 * together; MUCURA's skin is one black glass panel with the same red title bar
 * as every other menu, so the frame is a single element and the title bar sits
 * on top of it.
 */
export const OptionsFrame = ({
  width,
  height,
}: {
  width: number;
  height: number;
}) => <div className="options-frame" style={{ width, height }} aria-hidden />;
