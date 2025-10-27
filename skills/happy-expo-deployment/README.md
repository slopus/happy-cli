# Happy Expo Deployment Skill

Created: 2025-10-26

## Structure

```
happy-expo-deployment/
├── SKILL.md              - Main skill definition (required)
├── scripts/              - Executable code
│   └── example.sh       - Example script
├── references/          - Documentation for context loading
│   └── reference.md     - Example reference doc
└── assets/              - Files used in output
    └── .gitkeep         - Keep directory in git
```

## Development

1. Edit `SKILL.md` to define skill behavior
2. Add scripts to `scripts/` directory
3. Add reference docs to `references/`
4. Add assets to `assets/` if needed

## Testing

Use the skill by loading it in Claude Code and triggering its activation conditions.

## Packaging

Package the skill for distribution:
```bash
python ../../scripts/skill-tools/package_skill.py ../skills/happy-expo-deployment
```
