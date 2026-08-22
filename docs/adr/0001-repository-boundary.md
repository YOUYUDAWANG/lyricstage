# ADR 0001: Independent LyricStage repository

Status: accepted, 2026-08-23.

LyricStage is separated from BiliMusic because its browser providers, Web rendering runtime, extension lifecycle, tests, deployment, and licensing evolve independently from the SwiftUI iPhone app. Git history is retained from the BiliMusic implementation. BiliMusic consumes a fixed contract snapshot with a source commit; no submodule is required for either repository to build.
