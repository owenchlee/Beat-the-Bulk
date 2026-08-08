// Loose ambient declarations for untyped MediaPipe CDN globals (loaded via
// plain <script> tags, no @types package) and the incrementally-built BTB
// namespace. Deliberately `any`-typed at these boundaries — real
// type-checking happens inside each module's own functions.
export {};

declare global {
  var Pose: any;
  var Camera: any;
  var POSE_CONNECTIONS: any;
  var BTB: any;
  function drawConnectors(...args: any[]): void;
  function drawLandmarks(...args: any[]): void;

  interface Window {
    BTB: any;
    webkitAudioContext: typeof AudioContext;
  }

  interface HTMLElement {
    value?: string;
    checked?: boolean;
    disabled?: boolean;
  }

  // Event handlers in app.js read e.target.value/.checked directly rather
  // than casting to HTMLInputElement each time — loosen the base type here.
  interface EventTarget {
    value?: string;
    checked?: boolean;
  }
}
