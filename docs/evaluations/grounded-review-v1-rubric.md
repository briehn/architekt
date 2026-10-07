# Grounded Review v1: frozen evaluation set and rubric

The ten fixed POST request bodies are in `grounded-review-v1-fixtures.json`. They are the inputs for the later live quality evaluation; no provider was called for this freeze. Preserve these exact graph and committed Design Brief fields during model comparison. The set includes a populated boundary, an empty boundary, and duplicate visible component names. It covers direct client/database access and cycles as reviewable observations rather than presumed defects.

Evaluate each resolved review on four dimensions, recording concrete examples rather than only a score:

1. **Grounding:** every selected alias resolves to the intended server evidence; modeled-fact wording remains deterministic; Design Brief excerpts are exact and attributed to user-authored context.
2. **Discipline:** tradeoffs are conditional; the review invents no requirements; it makes no categorical performance, capacity, security, availability, or correctness claim unsupported by the graph and brief. Generic boundaries remain generic grouping.
3. **Usefulness:** tradeoffs expose real alternatives/downside conditions, questions address specific uncertainty, and reasoning adds value beyond repeating the diagram.
4. **Structure:** the bounded sections are concise, avoid repetition and prose walls, and remain readable as an advisory system-design starting point.

Record invalid/rejected provider output separately from a valid but weak review. Compare the same ten inputs across model configurations in Slice 4; do not move the fixture or rubric after seeing results. Neither these fixtures nor deterministic validation can certify the truth of AI-authored tradeoffs.
