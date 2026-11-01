/*
 * Colors and distances for the sky and the cloud deck. Art is grayscale on
 * purpose and gets its colors here, so a sunset or a storm is just another
 * set of values.
 */

/** Painted sky brightness mapped to color: darkest, middle and brightest tones. */
export const SKY_PALETTE = { shadow: 0x3a6cc8, mid: 0x8dbcf0, light: 0xffffff } as const;

/** Cloud brightness mapped to color. Close tones: the clouds are soft, not banded. */
export const CLOUD_PALETTE = { shadow: 0xb4c8e0, mid: 0xe2ebf6, light: 0xffffff } as const;

/** What everything fades into with distance, and at the horizon. */
export const HAZE_COLOR = 0xe4ecf5;

/** Distance over which clouds fade into the haze (about 63% at this distance). Short, as in a milky sky. */
export const HAZE_DISTANCE = 140;
