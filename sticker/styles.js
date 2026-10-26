// Everything lives in a shadow root, so these styles can't leak into the page
// and the page's styles can't break the stickers.
export const CSS = `
:host {
  all: initial;
}

.home,
.anchor {
  position: fixed;
  pointer-events: none;
}

.home {
  z-index: 1;
}

.tilt,
.enter,
.fill {
  position: absolute;
  inset: 0;
}

.enter {
  will-change: transform;
}

.press {
  position: absolute;
  inset: 0;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.art {
  position: absolute;
  display: block;
  max-width: none;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.gloss {
  position: absolute;
  pointer-events: none;
  background-image: linear-gradient(
    105deg,
    rgba(255, 255, 255, 0) 38%,
    rgba(255, 255, 255, 0.75) 50%,
    rgba(255, 255, 255, 0) 62%
  );
  background-size: 320% 100%;
  background-repeat: no-repeat;
  mix-blend-mode: soft-light;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

/* The sticker's shadow while it's still in the air during the entrance. */
.air {
  position: absolute;
  inset: 0;
  filter: blur(7px);
  pointer-events: none;
}

.air-shape {
  position: absolute;
  opacity: 0;
  background: #000;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

.flap {
  position: absolute;
  pointer-events: none;
}

.hit {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

/* Googly eyes: domed plastic. */
.eye {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle at 42% 36%, rgba(0, 0, 0, 0) 0 58%, rgba(0, 0, 0, 0.13) 100%),
    var(--white);
  box-shadow: 0 0 0 var(--outline) rgba(10, 10, 10, 0.55), 0 1px 1.5px rgba(0, 0, 0, 0.35),
    inset 0 -1px 1.5px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.pupil {
  position: absolute;
  border-radius: 50%;
  will-change: transform;
}

.glint {
  position: absolute;
  top: 14%;
  left: 20%;
  width: 30%;
  height: 20%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  transform: rotate(-35deg);
}

/* What's left where a sticker started: a faint stain and, optionally,
   something hidden under it. */
.residue {
  position: absolute;
  background: rgba(10, 10, 10, 0.045);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

.under {
  position: absolute;
  pointer-events: none;
}

.under[data-away="true"] {
  pointer-events: auto;
}

/* While a sticker rides the cursor: catches the click that sticks it down. */
.carry {
  position: fixed;
  inset: 0;
  z-index: 6000;
  display: none;
  cursor: grabbing;
  touch-action: none;
  /* the board lets clicks through to the page; this layer must catch them */
  pointer-events: auto;
}

.carry[data-on="true"] {
  display: block;
}

/* The copy that rides on the cursor and tumbles away. */
.flight {
  position: fixed;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
  filter: drop-shadow(0 14px 16px rgba(0, 0, 0, 0.22));
}

.flight-inner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}

.face {
  position: absolute;
  inset: 0;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.face-back {
  transform: rotateY(180deg);
}

/* The trash can: inside under the falling sticker, body over it, and the
   lid swapping between the two. */
.can {
  position: fixed;
  left: 0;
  bottom: -6px;
  visibility: hidden;
  pointer-events: none;
}

.can-part {
  position: absolute;
  inset: 0;
  transform-origin: 50% 100%;
}

.lid {
  position: absolute;
  transform-origin: 50% 70%;
}

.puff {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(140, 128, 112, 0.6), rgba(140, 128, 112, 0) 68%);
  opacity: 0;
}

[hidden] {
  display: none !important;
}

@media print {
  :host {
    display: none !important;
  }
}
`;
