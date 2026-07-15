# Xiaohongshu CES Collector

A Codex skill that collects and ranks Xiaohongshu notes using criteria confirmed with the user before every run.

## Install

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo <OWNER>/xiaohongshu-ces-collector --path xiaohongshu-ces-collector
```

The skill becomes available on the next Codex turn. Invoke it with `$xiaohongshu-ces-collector`.

## Behavior

Before accessing Xiaohongshu, the skill always asks the user to confirm the search topic, result count, publication window, scoring formula, hard thresholds, output fields, and exclusions. It does not reuse a previous CES formula without confirmation.
