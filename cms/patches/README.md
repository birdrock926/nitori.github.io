# Patch notes

The Strapi admin package no longer requires a compatibility patch for `styled-components`.
Removing the previous patch restores the default ESM entrypoints that expect `styled-components@6` and fixes the `styled is not a function` runtime error triggered during admin builds.
