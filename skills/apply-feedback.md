# Apply Feedback

Workflow for interpreting user edits and feedback, then applying learned patterns to future content.

## Feedback Sources

1. **Direct edits** — User modifies generated content before publishing
2. **Explicit instructions** — User states a preference ("make it shorter", "less formal")
3. **Approvals** — User publishes content without changes (positive signal)
4. **Rejections** — User discards generated content entirely

## Step 1: Detect Edit Patterns

When the user edits generated content, compare the original and edited versions to classify changes:

| Pattern | Detection | Example |
|---------|-----------|---------|
| Shortening | Output length reduced by >20% | Removed filler phrases, condensed points |
| Lengthening | Output length increased by >20% | Added detail, examples, context |
| Tone shift | Sentiment or formality changed | Professional -> casual, serious -> playful |
| Structure change | Paragraph/list/format altered | Converted prose to bullet points |
| Word choice | Specific terms replaced | "utilize" -> "use", jargon removed |
| CTA change | Call-to-action modified or added | Changed from question to directive |
| Emoji/formatting | Emoji added/removed, formatting changed | Added line breaks, removed hashtags |

## Step 2: Record Observations

For each detected pattern, store:
- `pattern_type`: Category from the table above
- `direction`: What changed and how (e.g., "shorter by 35%")
- `platform`: Which platform this applies to (may be platform-specific)
- `content_type`: Which content type this applies to
- `occurrence_count`: How many times this pattern has appeared
- `confidence`: Increases with each consistent occurrence

## Step 3: Promote to Preferences

A pattern becomes a stored preference when:
- It occurs 3+ times consistently (same direction)
- No contradicting pattern exists with equal or higher count
- The user hasn't explicitly overridden it

Stored preferences are written to the user's preference memory and loaded during content generation (see `generate-content.md`).

## Step 4: Handle Conflicts

When feedback contradicts an existing preference:

1. Check if the contradiction is platform-specific or content-type-specific. If so, store as a scoped preference rather than overriding the general one.
2. If it's a genuine conflict on the same scope:
   - If new pattern has 2+ more occurrences, replace the old preference
   - If counts are close, flag for user confirmation: "I've noticed you sometimes prefer X and sometimes Y. Which should I default to?"
3. Never silently override a preference the user explicitly stated.

## Step 5: Proactive Application

When generating new content, apply stored preferences automatically:
- Check all preferences that match the current platform and content type
- Apply general preferences first, then platform-specific, then content-type-specific (most specific wins)
- Log which preferences were applied so the user can see why content looks a certain way

## Step 6: Approval Tracking

Track approval rates to validate preferences:
- If content using a learned preference gets approved without edits, increase confidence
- If content using a learned preference gets edited in the opposite direction, decrease confidence
- Preferences dropping below 50% approval rate should be flagged for review

## Output

After processing feedback:
- `patterns_detected`: List of edit patterns found
- `preferences_updated`: Which stored preferences changed
- `conflicts`: Any unresolved conflicts requiring user input
- `preference_summary`: Current state of all active preferences
