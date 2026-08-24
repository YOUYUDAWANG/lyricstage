# AM Shell visual release gate

The AM Shell is not a pixel clone of Apple Music. It must feel Apple-designed through stable hierarchy, restrained material, deliberate typography, predictable controls, and layouts that remain composed at real user window sizes.

## Required evidence before calling a shell change complete

Capture fresh screenshots from the deployed unpacked extension, after a real Chrome reload:

1. YouTube Music home page with populated shelves and the player bar visible.
2. Player page with Up Next visible.
3. Player page with LyricStage lyrics visible.
4. Desktop at the current user window size.
5. Compact desktop near 980px.
6. Narrow window near 760px when responsive CSS changed.

Do not reuse screenshots from an earlier build or treat DOM assertions as visual evidence.

## Self-review questions

The release remains blocked if any answer is no:

- Does the page have one obvious content hierarchy rather than several equally heavy glass rectangles?
- Do sidebar, search, main content, side panel, and player controls share intentional edges and gutters?
- Are artwork/video and the side panel aligned deliberately, without a large accidental void?
- Is the home-page content frame bounded, centered, and free of clipped first cards or duplicate guide offsets?
- Does the player bar preserve track identity, transport, and auxiliary controls without collapsing metadata to zero width?
- Do Lyrics, Up Next, and Related remain single-line, reachable, and correctly selected?
- Do loading, empty, and failure states explain themselves instead of leaving a blank panel?
- At each breakpoint, is the structure adapted rather than merely squeezed?
- After comparing the same-size Apple Music screenshot, would a user describe the result as calm, coherent, and carefully made?

Passing tests, builds, and DOM checks are necessary but cannot override a failed screenshot review.
