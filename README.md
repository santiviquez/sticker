# sticker

Die-cut stickers for your website. Peel one off, carry it around on your cursor and stick it somewhere else. Every time, it picks up dust and loses grip, and the fifth time it doesn't hold. Shake it off and an old trash can pops up to catch it.

See it in action on [santiviquez.com/stickers](https://www.santiviquez.com/stickers).

- Peel by dragging an edge. Let go early and it slaps back down.
- Peel it all the way and it sticks to your cursor, hanging from the edge you pulled.
- Click to stick it anywhere. On a phone, drag it and lift your finger.
- Each re-stick dirties the paper back and weakens the glue. The last one only half sticks, then falls.
- Move fast while carrying it, or press Esc, and it falls into the trash.
- Optional googly eyes that follow the cursor, blink and rattle.

No dependencies, no build step, no tracking. Plain JavaScript modules.

## Use it

Copy the `sticker` folder into your site, then:

```html
<script type="module">
  import { createBoard } from "/sticker/sticker.js";

  const board = createBoard();
  board.add({
    src: "/me.webp",
    eyes: { left: { x: 0.4, y: 0.36 }, right: { x: 0.59, y: 0.36 } },
  });
</script>
```

Stickers sit fixed on the screen, in their own shadow root, so your CSS and theirs stay apart.

### Your image

Any image with a transparent background works; plain rectangles (book covers) work too. The border, paper back and peel shape are built from it in the browser.

To cut yourself out of a photo: on a Mac or iPhone, long-press the subject in Photos and copy it. Or use the tool here, which also finds your eyes:

```sh
swiftc -O tools/cutout.swift -o /tmp/cutout
/tmp/cutout photo.jpg me.png
# eyes: { left: { x: 0.424, y: 0.341 }, right: { x: 0.598, y: 0.338 }, size: 0.061 }
```

Images from another domain need CORS headers, because the sticker reads their pixels.

### The lab

Open `lab.html` (any static server works, e.g. `python3 -m http.server`). Load your image, drag the eyes into place, tune everything, and copy the settings as a `board.add(...)` call. Your image stays in your browser.

## Options

`createBoard(options)`:

| option | default | |
| --- | --- | --- |
| `appear` | `"first-move"` | when stickers come in: on the first cursor move, `"load"`, or `"manual"` (call `board.show()`) |
| `zIndex` | `40` | where the board sits on your page |
| `minWidth` | `0` | hide below this window width |
| `touch` | `true` | show on touch screens |
| `trash` | `{ enabled: true, size: 150, worn: true }` | the trash can; `worn` also catches stickers that wore out |
| `onEnter` | `null` | called with the sticker when it comes in at its starting spot |
| `onStick` | `null` | called with the sticker each time it's stuck down somewhere new |

`board.add(options)` takes `src`, `size`, `tilt`, `at` (CSS-like `left`/`right`/`top`/`bottom`, or `x`/`y` for the centre), `eyes`, `under` (HTML revealed where it started) and groups for `look`, `entrance`, `peel`, `carry` and `glue`. Every option and its default is in `DEFAULTS` at the top of [`sticker/sticker.js`](sticker/sticker.js).

The board also has `show()` (bring the stickers in, for `appear: "manual"`; resolves once they're all in), `reset()` (every sticker fresh, back where it started) and `destroy()`. Set `entrance: { style: "none" }` on a sticker for no entrance animation at all.

Each sticker has `enter()`, `update(options)` (what the lab uses), `covers(x, y)` (is this screen point under it right now? returns the point in its own coordinates) and `addMarks(marks)` (more dirt on its paper back, made with `makeSpeck` from `sticker/dust.js`). With the hooks, that's enough to build things around the stickers, like a dusty screen they pick up dust from.

## Browsers

Built and tested in Chrome. It uses canvas, the Web Animations API, CSS `linear()` easing (with a fallback), `clip-path` and shadow DOM, so recent Safari and Firefox should work; reports welcome. It respects `prefers-reduced-motion`.

## License

The code is MIT. The photo in `examples/` is me, please use your own face.
