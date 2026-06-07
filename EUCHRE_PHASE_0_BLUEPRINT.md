# 1v1 Euchre Freeplay Phase 0 Blueprint

## Project Identity

Project name: `1v1-euchre-freeplay`

Purpose: build a standalone free-play 1v1 Euchre website where Mehdi can host 1v1 Euchre tournaments using a private admin key.

This project is separate from any Spades project. It must not depend on a Spades ZIP, import Spades files, copy Spades gameplay logic, or modify any Spades repository.

## Product Goal

Create a lightweight website for free-play 1v1 Euchre with casual play, friend matches, and admin-hosted tournaments.

The experience should eventually support:

- Home page
- Rules page
- Quick Match
- Play a Friend
- Tournament lobby
- Bracket creation
- Player join links
- Match rooms
- Admin key host controls
- Score reporting and match completion
- Spectator-safe structure later

## Non-Goals

Phase 0 is planning only.

No gameplay code should be written in Phase 0. No card engine, UI implementation, database schema implementation, authentication implementation, deployment scripts, or match simulation should be created yet.

The product must stay strictly free-play and should not include real-value competition features or related terminology.

## Target Audience

Primary host: Mehdi.

Primary players: people joining free-play 1v1 Euchre matches or tournaments through links and codes.

Secondary future users: spectators who may view tournament progress without accessing private player hands, admin controls, or hidden match state.

## Core Screens

### Home Page

The home page should explain that the site is for free-play 1v1 Euchre and provide entry points for:

- Quick Match
- Play a Friend
- Tournament lobby
- Rules

### Rules Page

The rules page should explain the supported 1v1 Euchre rules in plain language, including bowers, trump, following suit, scoring, and Stick the Dealer.

### Quick Match

Quick Match should eventually create or join an available free-play 1v1 match with the default Community Competitive rules.

### Play a Friend

Play a Friend should eventually create a private match room and produce a shareable join link.

### Tournament Lobby

The tournament lobby should allow players to join a public tournament using a code or join link. It should show player status and bracket readiness without exposing admin tools.

### Match Rooms

Match rooms should hold the actual 1v1 Euchre play experience later. Phase 0 only defines that match rooms exist as a future route and ownership boundary.

### Admin Host Tools

Admin tools should be available only after a private admin key is verified. The admin key must not be shown to players, included in public join links, or passed to random clients.

## Default Rules Summary

- 24-card deck: 9, 10, J, Q, K, A
- 2 players
- Each player gets 5 cards
- Kitty/upcard is used
- Trump selection is required
- Right bower is highest trump
- Left bower is second-highest trump and counts as trump
- Players must follow suit when able
- Maker needs 3 or more tricks
- Maker takes 3 or 4 tricks: maker scores 1 point
- Maker takes 5 tricks: maker scores 2 points
- Defender euchres maker: defender scores 2 points
- First player to 10 points wins
- Stick the Dealer is ON by default

## Phase 0 Deliverables

This `/docs` package defines:

- Product blueprint
- Rules specification
- Game modes
- Tournament and admin-key plan
- Reuse boundaries
- Engine test plan
- Folder structure proposal
- Phase 1 recommendation

## Phase 0 Completion Criteria

Phase 0 is complete when the planning docs are present, internally consistent, and clear enough to guide implementation without borrowing from the Spades project.
