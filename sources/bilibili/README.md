# Bilibili source

This is a planned provider boundary only. No Bilibili browser provider is implemented or claimed in the `0.3.0` standalone baseline.

A future provider should translate Bilibili track/media state into the same portable Companion contracts without importing BiliMusic's SwiftUI playback engine or making either repository a build-time dependency of the other.

The implementation seam is `BrowserSourceAdapterV1<PortableSourceSnapshotV1>` plus `SourceRegistryV1` in `packages/companion/src/source.ts`. A future Bilibili adapter must own only Bilibili identity, DOM/media observation and transport capabilities; the registry, lease, authority and renderer contracts remain shared. This documentation does not restore the deferred provider scope.
