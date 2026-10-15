type SeoEvent = 'estimate_start' | 'estimate_complete' | 'quote_submit';

// Only event names cross the analytics boundary, never form values or prices.
export function trackSeoEvent(name: SeoEvent): void {
  document.dispatchEvent(new Event(`dura-fence:${name}`));
}

export function createEstimateTracker(emit: (name: SeoEvent) => void = trackSeoEvent) {
  let started = false;
  let completed = false;
  return (valid: boolean): void => {
    if (!started) {
      started = true;
      emit('estimate_start');
    }
    if (valid && !completed) {
      completed = true;
      emit('estimate_complete');
    }
  };
}
