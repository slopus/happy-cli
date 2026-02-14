import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

import type { CodexResumeEntry } from '@/codex/utils/rolloutScanner';
import { sanitizeInkText, truncateInkText } from '@/utils/inkSanitize';

interface CodexResumeSelectorProps {
    entries: CodexResumeEntry[];
    showAll: boolean;
    onSelect: (entry: CodexResumeEntry) => void;
    onCancel: () => void;
}

const MAX_PREVIEW = 120;

export const CodexResumeSelector: React.FC<CodexResumeSelectorProps> = ({
    entries,
    showAll,
    onSelect,
    onCancel,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { stdout } = useStdout();

    const safeEntries = useMemo(() => {
        return entries.map((entry) => ({
            entry,
            preview: sanitizeInkText(entry.preview ?? ''),
            branch: sanitizeInkText(entry.gitBranch ?? '-'),
            cwd: sanitizeInkText(entry.cwd ?? '-'),
            id: sanitizeInkText(entry.id ?? ''),
        }));
    }, [entries]);

    const filtered = useMemo(() => {
        const normalized = sanitizeInkText(query).toLowerCase();
        if (!normalized) return safeEntries;
        return safeEntries.filter((item) => {
            const haystack = [item.preview, item.branch, item.cwd, item.id]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalized);
        });
    }, [safeEntries, query]);

    useEffect(() => {
        if (selectedIndex >= filtered.length) {
            setSelectedIndex(Math.max(0, filtered.length - 1));
        }
    }, [filtered.length, selectedIndex]);

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
            return;
        }
        if (key.return) {
            const entry = filtered[selectedIndex];
            if (entry) {
                onSelect(entry.entry);
            }
            return;
        }
        if (key.escape || (key.ctrl && input === 'c')) {
            onCancel();
            return;
        }
        if (key.backspace || key.delete) {
            setQuery((prev) => prev.slice(0, -1));
            setSelectedIndex(0);
            return;
        }
        if (!key.ctrl && !key.meta && !key.shift && input && input.length === 1) {
            setQuery((prev) => prev + input);
            setSelectedIndex(0);
        }
    });

    const rows = useMemo(() => {
        return filtered.map((item) => {
            const updated = formatRelativeTime(item.entry.updatedAt);
            const preview = truncateInkText(item.preview, MAX_PREVIEW);
            return { entry: item.entry, updated, branch: item.branch, cwd: item.cwd, preview };
        });
    }, [filtered]);

    const maxUpdated = Math.max('Updated'.length, ...rows.map((row) => row.updated.length));
    const maxBranch = Math.max('Branch'.length, ...rows.map((row) => row.branch.length));
    const maxCwd = Math.max('CWD'.length, ...rows.map((row) => row.cwd.length));
    const columns = stdout?.columns ?? null;
    const maxPreviewWidth = useMemo(() => {
        if (!columns) return MAX_PREVIEW;
        // Row format:
        // `${prefix} ${updated.padEnd(maxUpdated)}  ${branch.padEnd(maxBranch)} ${cwd.padEnd(maxCwd)} ${preview}`
        // so everything before preview consumes a fixed number of terminal columns.
        const prefixAndSpaces = 2; // "> "
        const betweenUpdatedAndBranch = 2; // two spaces
        const betweenBranchAndCwdOrPreview = 1; // one space
        const cwdSegment = showAll ? maxCwd + 1 : 0; // plus trailing space
        const beforePreview =
            prefixAndSpaces
            + maxUpdated
            + betweenUpdatedAndBranch
            + maxBranch
            + betweenBranchAndCwdOrPreview
            + cwdSegment;

        // Leave at least a small preview so the UX isn't blank, and cap to a reasonable max.
        return Math.min(MAX_PREVIEW, Math.max(10, columns - beforePreview));
    }, [columns, maxBranch, maxCwd, maxUpdated, showAll]);

    const totalRows = rows.length;
    const usableRows = Math.max(5, (stdout?.rows ?? 24) - 6);
    const start = Math.max(
        0,
        Math.min(selectedIndex, Math.max(0, totalRows - usableRows))
    );
    const visible = rows.slice(start, start + usableRows);

    return (
        <Box flexDirection="column" paddingY={1}>
            <Text color="cyan">Resume a previous session</Text>
            <Text dimColor>{query ? `Search: ${sanitizeInkText(query)}` : 'Type to search'}</Text>

            <Box marginTop={1} flexDirection="column">
                <Text>
                    {pad('Updated', maxUpdated)}  {pad('Branch', maxBranch)}{' '}
                    {showAll ? `${pad('CWD', maxCwd)} ` : ''}Conversation
                </Text>
                {visible.length === 0 ? (
                    <Text dimColor>No matching sessions.</Text>
                ) : (
                    visible.map((row, index) => {
                        const absoluteIndex = start + index;
                        const selected = absoluteIndex === selectedIndex;
                        const prefix = selected ? '>' : ' ';
                        const preview = truncateInkText(row.preview, maxPreviewWidth);
                        return (
                            <Text key={row.entry.id} color={selected ? 'cyan' : undefined}>
                                {prefix} {pad(row.updated, maxUpdated)}  {pad(row.branch, maxBranch)}{' '}
                                {showAll ? `${pad(row.cwd, maxCwd)} ` : ''}{preview}
                            </Text>
                        );
                    })
                )}
            </Box>

            <Box marginTop={1}>
                <Text dimColor>Up/Down to navigate, Enter to resume, Esc to cancel</Text>
            </Box>
        </Box>
    );
};

function pad(value: string, width: number): string {
    if (value.length >= width) return value;
    return value + ' '.repeat(width - value.length);
}

function formatRelativeTime(date?: Date): string {
    if (!date) return '-';
    const diffMs = Date.now() - date.getTime();
    const seconds = Math.max(0, Math.floor(diffMs / 1000));
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
