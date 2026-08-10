export const COPUOS_VIDEO_START_SECONDS = 5;
export const COPUOS_VIDEO_END_SECONDS = 85.783333;

type ScrollKeyframe = readonly [progress: number, seconds: number];

const COPUOS_SCROLL_KEYFRAMES: readonly ScrollKeyframe[] = [
  [0, COPUOS_VIDEO_START_SECONDS],
  [0.12, 30],
  [0.42, 45],
  [0.72, 65],
  [1, COPUOS_VIDEO_END_SECONDS],
];

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
}

export function copuosVideoTimeForProgress(progress: number) {
  const safeProgress = clampProgress(progress);
  for (let index = 1; index < COPUOS_SCROLL_KEYFRAMES.length; index += 1) {
    const [endProgress, endSeconds] = COPUOS_SCROLL_KEYFRAMES[index];
    if (safeProgress > endProgress) continue;
    const [startProgress, startSeconds] = COPUOS_SCROLL_KEYFRAMES[index - 1];
    const localProgress = (safeProgress - startProgress) / (endProgress - startProgress);
    return startSeconds + (endSeconds - startSeconds) * localProgress;
  }
  return COPUOS_VIDEO_END_SECONDS;
}

export function copuosChapterForProgress(progress: number) {
  const safeProgress = clampProgress(progress);
  if (safeProgress < 0.12) return 0;
  if (safeProgress < 0.42) return 1;
  if (safeProgress < 0.72) return 2;
  return 3;
}
