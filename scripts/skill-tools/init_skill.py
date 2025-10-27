#!/usr/bin/env python3
"""
Initialize a new Claude Skill with proper structure.

Usage:
    python init_skill.py <skill-name> --path <output-directory>

Example:
    python init_skill.py ios-simulator-control --path ./skills
"""

import argparse
import os
import sys
from pathlib import Path
from datetime import datetime


SKILL_MD_TEMPLATE = """---
name: {name}
description: TODO: A clear description of what this skill does and when to use it
license: MIT
---

# {display_name}

TODO: Add your instructions here that Claude will follow when this skill is active.

## Purpose

Describe what this skill helps Claude accomplish.

## When to Use

- Trigger condition 1
- Trigger condition 2
- Trigger condition 3

## Capabilities

- Capability 1
- Capability 2
- Capability 3

## Usage Examples

### Example 1: Basic Usage

```bash
# Command or usage pattern
```

### Example 2: Advanced Usage

```bash
# More complex usage
```

## Guidelines

- Guideline 1: Best practice
- Guideline 2: Important consideration
- Guideline 3: Common pitfall to avoid

## References

See files in the `references/` directory for detailed documentation.
"""

EXAMPLE_SCRIPT_SH = """#!/bin/bash
# Example script for {name}
# This script demonstrates how to structure executable code for your skill

set -e  # Exit on error

# Parse arguments
ACTION=$1
shift  # Remove first arg

case "$ACTION" in
  "example")
    echo "Example action executed"
    ;;
  "help")
    echo "Usage: $0 <action>"
    echo "Actions: example, help"
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
"""

EXAMPLE_REFERENCE_MD = """# {display_name} Reference

## Overview

This document provides detailed reference information for using this skill effectively.

## Commands

### Command 1

**Description**: What this command does

**Usage**:
```bash
command [options] <arguments>
```

**Options**:
- `--option1`: Description of option 1
- `--option2`: Description of option 2

**Examples**:
```bash
command --option1 value
```

## Best Practices

1. Best practice 1
2. Best practice 2
3. Best practice 3

## Troubleshooting

### Issue 1
**Problem**: Description of issue
**Solution**: How to resolve it

### Issue 2
**Problem**: Description of issue
**Solution**: How to resolve it
"""

README_MD = """# {display_name} Skill

Created: {timestamp}

## Structure

```
{name}/
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
python ../../scripts/skill-tools/package_skill.py ../skills/{name}
```
"""


def create_skill_structure(skill_name: str, output_dir: Path):
    """Create the complete skill directory structure."""

    # Create main skill directory
    skill_dir = output_dir / skill_name
    skill_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectories
    (skill_dir / "scripts").mkdir(exist_ok=True)
    (skill_dir / "references").mkdir(exist_ok=True)
    (skill_dir / "assets").mkdir(exist_ok=True)

    # Create .gitkeep for assets directory
    (skill_dir / "assets" / ".gitkeep").touch()

    # Create SKILL.md
    display_name = skill_name.replace('-', ' ').replace('_', ' ').title()
    skill_md = SKILL_MD_TEMPLATE.format(
        name=skill_name,
        display_name=display_name
    )
    (skill_dir / "SKILL.md").write_text(skill_md)

    # Create example script
    example_script = EXAMPLE_SCRIPT_SH.format(name=skill_name)
    script_path = skill_dir / "scripts" / "example.sh"
    script_path.write_text(example_script)
    script_path.chmod(0o755)  # Make executable

    # Create example reference
    reference_md = EXAMPLE_REFERENCE_MD.format(display_name=display_name)
    (skill_dir / "references" / "reference.md").write_text(reference_md)

    # Create README
    readme = README_MD.format(
        display_name=display_name,
        name=skill_name,
        timestamp=datetime.now().strftime("%Y-%m-%d")
    )
    (skill_dir / "README.md").write_text(readme)

    return skill_dir


def main():
    parser = argparse.ArgumentParser(
        description='Initialize a new Claude Skill with proper structure'
    )
    parser.add_argument(
        'skill_name',
        help='Name of the skill (e.g., ios-simulator-control)'
    )
    parser.add_argument(
        '--path',
        default='./skills',
        help='Output directory for skills (default: ./skills)'
    )

    args = parser.parse_args()

    # Validate skill name
    skill_name = args.skill_name.lower()
    if not skill_name.replace('-', '').replace('_', '').isalnum():
        print(f"Error: Skill name must contain only letters, numbers, hyphens, and underscores")
        sys.exit(1)

    # Create output directory
    output_dir = Path(args.path)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create skill structure
    try:
        skill_dir = create_skill_structure(skill_name, output_dir)
        print(f"✓ Created skill structure at: {skill_dir}")
        print(f"\nNext steps:")
        print(f"1. Edit {skill_dir}/SKILL.md to define skill behavior")
        print(f"2. Add scripts to {skill_dir}/scripts/")
        print(f"3. Add reference docs to {skill_dir}/references/")
        print(f"4. Package: python scripts/skill-tools/package_skill.py {skill_dir}")

    except Exception as e:
        print(f"Error creating skill: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
