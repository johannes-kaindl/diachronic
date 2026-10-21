# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Added

- First release (Stage 1): **stands per note**, **suggestions as CriticMarkup** written from the difference to the incoming text (word level, with a round-trip check before anything is written), the **review sidebar** (one card per change, accept, reject, comment, reply, resolve, accept or reject all), the **stands browser** with word-level comparison and restore, **send back** and **take over** a returned file (nothing is overwritten when both sides changed), **release**, editor marks with form (underline, strike-through) and an optional colour by author, and the settings tab.
- Works on desktop and mobile (no Node modules, no network access).

### Known limits

- The file extension of the stand files (`json`) is provisional until Obsidian Sync has been checked on the iPhone.
- The reading view shows the marks as plain text; the hidden block is invisible there, but shows as plain lines in the editor's live preview.
