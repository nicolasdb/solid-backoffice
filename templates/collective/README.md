# What a collective copies onto its pod

Laid out like the root of a collective's pod. Steps:
[set up a collective's pod](../../docs/how-to/set-up-a-collective.md); what
each path is and who may read it:
[collective files](../../docs/reference/collective-files.md#the-pod-tree).

| Here | On the pod | |
|---|---|---|
| `config.ttl` | `config.ttl` | replace every UPPERCASE value; filled examples in [`docs/examples/`](../../docs/examples/) |
| `membres.ttl` | `membres.ttl` (`hs:roster`) | as is; accepting a request writes each member's lines |
| `guide/` | `guide/` (`hs:guide`) | onboarding, FAQ and glossary, in French, for members and agents |

The agent's procedures are not here: they ship with the connector they call,
in solid-css-overlay
[`mcp-connector/procedures/`](https://github.com/nicolasdb/solid-css-overlay/blob/main/mcp-connector/procedures/README.md),
and are copied to the pod's `principles/` (`hs:procedures`).

**Copied, not shared.** A collective makes its copy its own: its words, its
annexes. These files are the reference that copies are compared against,
and where a fix to the generic text lands first. Keeping a copy in step
(a version in each file, a backoffice command run as a ceremony) is open:
[collective files](../../docs/reference/collective-files.md#open).

`config.ttl` is parsed by the backoffice's own tests
(`src/lib/collective.test.ts`), like the examples, so a property the app
requires cannot go missing here. The `guide/` files are drafts of
2026-10-01, to review before they are versioned.
