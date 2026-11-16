---
layout: home

hero:
  name: zalo-beeper-bridge
  text: Your Zalo chats in Beeper
  tagline: A self-hosted Matrix bridge for a personal Zalo account, with a history importer that brings your old chats along.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is it?
      link: /guide/what-is-it
    - theme: alt
      text: GitHub
      link: https://github.com/lethucthanhtu/zalo-beeper-bridge

features:
  - title: Two-way messaging
    details: Text, mentions, replies, photos, videos, files, voice notes, stickers, reactions, read receipts and typing, for DMs and groups.
  - title: Full history import
    details: Rebuild each chat from Zalo PC and its encrypted backup, with original timestamps, real media, replies and mentions.
  - title: Runs on your machine
    details: One container runs the appservice and bbctl proxy. Credentials are encrypted at rest and logs never contain message content.
  - title: Resilient
    details: The listener reconnects through network outages and fetches the messages it missed after every reconnect.
---

::: warning Unofficial and at your own risk
The bridge talks to Zalo Web through [zca-js](https://github.com/RFS-ADRENO/zca-js), a reverse-engineered client. This breaks Zalo's terms of service and **can get your account locked or banned**. Use an account you can afford to lose. Not affiliated with Zalo/VNG or Beeper.
:::
