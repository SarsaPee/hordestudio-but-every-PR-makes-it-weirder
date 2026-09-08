# MCP image integration: audit and repair

## Confirmed defects

- Tool ranking scanned descriptions, so instructions mentioning generation made utilities look generation-ready.
- Higgsfield's nested `params` contract was treated as a top-level form; model and prompt were not mapped correctly.
- Reference aliases omitted `references` and `medias`; absent reference fields silently dropped the image while the prompt claimed a reference existed.
- Reference arrays were always strings, even when the schema declared objects.
- Required enums silently selected their first item, including potentially consequential generation settings.
- Tool discovery read only the first page; model catalogs were never queried.
- Generation depended on visiting Studio to initialize the in-memory tool catalog.
- Reference-related failures could trigger a second generation without the reference.
- The bridge searched arbitrary returned URLs, including echoed input images, and did not understand queued Higgsfield results.

## Implemented

The picker now limits the VH photo route to recognizable prompt-based raster generation tools. Model catalogs use advertised read-only list tools with cursor pagination. Models have a searchable name/ID control; supported Higgsfield model parameters and aspect ratios augment the form. Required and common output controls remain visible; optional extras collapse under Advanced tool options. Raw instruction-heavy descriptions no longer fill the main form.

Requests support top-level and nested `params` schemas, scalar/array URL reference objects, and Higgsfield `medias`. Missing or unsupported mappings fail before generation. Required values are explicit and numeric/enum constraints are checked. The automatic reference-dropping retry has been removed. Generation rediscovers its saved tool after reload, without selecting a replacement. Provider-switch responses are guarded against updating the wrong editor.

For Higgsfield, local data images use advertised upload-slot and confirm tools before the generation call. Queued jobs use the advertised status tool; they are not resubmitted. Image extraction recognizes result URLs and skips input/parameter subtrees.

## Verification

- 32/32 offline engine suites passed, including new MCP schema, reference, numeric-validation, utility-filtering and model-pagination contracts.
- 34/34 bridge tests passed, including upload/confirm ordering, queued-job polling, tool pagination and reference/output separation.
- 15 browser scenarios passed, including the real searchable model control, collapsed options, selection binding and nested request construction.
- All provider calls and uploads in tests were mocked. No user saves or provider credits were used.

## Remaining limits

This does not establish successful generation on the user's live connections. Magnific's exact current account schema was not fetched; unknown object-reference shapes, local-upload requirements, schema unions/references, and alternative catalog envelopes need explicit adapters rather than guessed payloads. The current form supports top-level fields and one `params` wrapper, not arbitrary JSON Schema.

Higgsfield pending jobs are polled in the request lifetime; durable job recovery across a launcher restart is not implemented. A timeout explicitly asks the user to check the provider before resubmitting. Only the ordinary supported image generation flow is integrated, not every utility or multi-step media workflow.

Restart the local launcher/bridge and reload the app to load both halves of this change. No launcher restart was performed during this audit.

## Magnific follow-up: actual connected schema

The initial repair missed Magnific's provider-specific contract. A read-only tools/catalog inspection confirmed:

- `images_generate.mode` selects the model by its catalog `slug`.
- `images_models_list` returns 48 models as TOON text, not JSON `items`.
- `references` requires `{type: "image", identifier: "<creation ID>"}`. Image URLs/data images cannot be passed directly as provider identifiers.
- Local references require `creations_request_upload`, a successful PUT, and `creations_finalize_upload`. Public HTTPS images use `creations_upload_image`.
- Generation returns creation IDs; `creations_get` supplies status and the finished full-resolution URL.

These contracts now have explicit adapters. Catalog names, aspect ratios, resolutions, qualities and photo-reference eligibility are read from the actual catalog. Unsupported photo-reference models fail before upload/generation. The mode picker remains outside Advanced options. Reference uploads are finalized before generation; failed uploads do not proceed. Creation polling never resubmits generation.

Captured public schema/catalog metadata is retained in `scratch/fixtures/magnific-image-contract.json`. No live upload or generation was made. Read-only metadata was fetched through the existing local bridge; generation verification uses mocks. Restarting the launcher is required to load the Python adapter.

## Launcher follow-up: stale bridge compatibility

The running `/health` response still reported `20260905-v173`. The earlier edits had not changed `BRIDGE_BUILD`, so reopening the launcher could incorrectly reuse the process containing the pre-import implementation. The build identity now includes a hash of the bridge source. Existing launcher replacement logic will therefore replace a changed bridge at the same storage origin.

Health now advertises `capabilities.magnificReferenceImport = 1`. The browser checks this before submitting a Magnific generation. An older bridge receives no generation request and the user gets an explicit launcher-update message. Regression checks cover both rejection of the old bridge and a single submission to the compatible bridge. No live generation was submitted and the user's running process was not restarted during this repair.
