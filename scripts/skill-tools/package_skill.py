#!/usr/bin/env python3
"""
Package and validate a Claude Skill for distribution.

Usage:
    python package_skill.py <path/to/skill-folder> [output-directory]

Example:
    python package_skill.py ./skills/ios-simulator-control
    python package_skill.py ./skills/ios-simulator-control ./dist
"""

import argparse
import os
import sys
import zipfile
import yaml
from pathlib import Path
from typing import Dict, Any, List


class SkillValidator:
    """Validates Claude Skill structure and content."""

    def __init__(self, skill_path: Path):
        self.skill_path = skill_path
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def validate(self) -> bool:
        """Run all validations. Returns True if skill is valid."""
        self._check_skill_md_exists()
        if self.errors:
            return False

        self._validate_frontmatter()
        self._check_directory_structure()
        self._validate_scripts()

        return len(self.errors) == 0

    def _check_skill_md_exists(self):
        """Verify SKILL.md file exists."""
        skill_md = self.skill_path / "SKILL.md"
        if not skill_md.exists():
            self.errors.append(f"Missing required SKILL.md file")

    def _validate_frontmatter(self):
        """Validate YAML frontmatter in SKILL.md."""
        skill_md = self.skill_path / "SKILL.md"
        if not skill_md.exists():
            return

        content = skill_md.read_text()

        # Check for frontmatter delimiters
        if not content.startswith('---\n'):
            self.errors.append("SKILL.md must start with '---' YAML frontmatter")
            return

        # Extract frontmatter
        parts = content.split('---\n', 2)
        if len(parts) < 3:
            self.errors.append("SKILL.md frontmatter not properly closed with '---'")
            return

        frontmatter_text = parts[1]

        # Parse YAML
        try:
            frontmatter = yaml.safe_load(frontmatter_text)
        except yaml.YAMLError as e:
            self.errors.append(f"Invalid YAML in frontmatter: {e}")
            return

        # Validate required fields
        if not isinstance(frontmatter, dict):
            self.errors.append("Frontmatter must be a YAML object")
            return

        # Check required: name
        if 'name' not in frontmatter:
            self.errors.append("Frontmatter missing required 'name' field")
        else:
            name = frontmatter['name']
            if not isinstance(name, str) or not name:
                self.errors.append("'name' must be a non-empty string")
            elif len(name) > 64:
                self.errors.append(f"'name' too long (max 64 chars): {len(name)}")
            elif not name.replace('-', '').replace('_', '').replace('.', '').isalnum():
                self.errors.append("'name' must contain only letters, numbers, hyphens, underscores, dots")

        # Check required: description
        if 'description' not in frontmatter:
            self.errors.append("Frontmatter missing required 'description' field")
        else:
            desc = frontmatter['description']
            if not isinstance(desc, str) or not desc:
                self.errors.append("'description' must be a non-empty string")
            elif len(desc) > 1024:
                self.errors.append(f"'description' too long (max 1024 chars): {len(desc)}")
            elif desc.startswith('TODO:'):
                self.warnings.append("Description still contains TODO placeholder")

        # Check markdown content exists
        markdown_content = parts[2].strip()
        if not markdown_content:
            self.warnings.append("SKILL.md has no content after frontmatter")
        elif markdown_content.startswith('TODO:'):
            self.warnings.append("SKILL.md content contains TODO placeholders")

    def _check_directory_structure(self):
        """Check for recommended directories."""
        if not (self.skill_path / "scripts").exists():
            self.warnings.append("No scripts/ directory found")

        if not (self.skill_path / "references").exists():
            self.warnings.append("No references/ directory found")

    def _validate_scripts(self):
        """Validate executable scripts."""
        scripts_dir = self.skill_path / "scripts"
        if not scripts_dir.exists():
            return

        script_files = [f for f in scripts_dir.iterdir() if f.is_file()]

        if not script_files:
            self.warnings.append("scripts/ directory is empty")
            return

        for script in script_files:
            # Check if executable
            if not os.access(script, os.X_OK):
                self.warnings.append(f"Script not executable: {script.name}")

    def print_results(self):
        """Print validation results."""
        if self.errors:
            print(f"\n❌ Validation FAILED with {len(self.errors)} error(s):")
            for error in self.errors:
                print(f"  - {error}")

        if self.warnings:
            print(f"\n⚠️  {len(self.warnings)} warning(s):")
            for warning in self.warnings:
                print(f"  - {warning}")

        if not self.errors and not self.warnings:
            print(f"\n✓ Skill validation passed with no issues")
        elif not self.errors:
            print(f"\n✓ Skill validation passed (warnings can be ignored)")


def package_skill(skill_path: Path, output_dir: Path) -> Path:
    """Package skill into a .zip file."""

    skill_name = skill_path.name
    output_file = output_dir / f"{skill_name}.zip"

    # Create zip file
    with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add all files in skill directory
        for file_path in skill_path.rglob('*'):
            if file_path.is_file():
                # Calculate archive name (relative to skill directory)
                archive_name = file_path.relative_to(skill_path.parent)
                zipf.write(file_path, archive_name)

    return output_file


def main():
    parser = argparse.ArgumentParser(
        description='Validate and package a Claude Skill'
    )
    parser.add_argument(
        'skill_path',
        help='Path to skill folder (e.g., ./skills/my-skill)'
    )
    parser.add_argument(
        'output_dir',
        nargs='?',
        default='.',
        help='Output directory for .zip file (default: current directory)'
    )

    args = parser.parse_args()

    # Validate paths
    skill_path = Path(args.skill_path)
    if not skill_path.exists():
        print(f"Error: Skill path does not exist: {skill_path}")
        sys.exit(1)

    if not skill_path.is_dir():
        print(f"Error: Skill path must be a directory: {skill_path}")
        sys.exit(1)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Validate skill
    print(f"Validating skill: {skill_path.name}")
    validator = SkillValidator(skill_path)
    is_valid = validator.validate()
    validator.print_results()

    if not is_valid:
        print(f"\n❌ Skill validation failed. Please fix errors before packaging.")
        sys.exit(1)

    # Package skill
    print(f"\nPackaging skill...")
    try:
        output_file = package_skill(skill_path, output_dir)
        print(f"✓ Skill packaged successfully: {output_file}")
        print(f"\nYou can now:")
        print(f"1. Distribute {output_file.name}")
        print(f"2. Install by unzipping to ~/.claude/skills/")
        print(f"3. Claude will auto-load on next session")

    except Exception as e:
        print(f"Error packaging skill: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
