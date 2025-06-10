#!/bin/bash

# Default values
DEFAULT_INPUT_DIR="."
DEFAULT_OUTPUT_FILE="combined_web_content.txt"

# Function to display usage
usage() {
    echo "Usage: $0 [INPUT_DIRECTORY] [OUTPUT_FILE]"
    echo "   Creates an OUTPUT_FILE containing:"
    echo "   1. A list of all .js, .css, .html, and .png files found in INPUT_DIRECTORY (and subfolders)."
    echo "   2. The combined content of all .js, .css, and .html files from INPUT_DIRECTORY (and subfolders)."
    echo ""
    echo "   It automatically ignores 'node_modules' directories."
    echo ""
    echo "   INPUT_DIRECTORY: Path to the folder to scan. Defaults to '$DEFAULT_INPUT_DIR' (current directory)."
    echo "   OUTPUT_FILE:     Path to the output text file. Defaults to '$DEFAULT_OUTPUT_FILE'."
    echo ""
    echo "Example: $0 ./my_web_project project_dump.txt"
    echo "Example (defaults): $0"
    exit 1
}

# Parse arguments
INPUT_DIR="${1:-$DEFAULT_INPUT_DIR}"
OUTPUT_FILE="${2:-$DEFAULT_OUTPUT_FILE}"

# Handle help request
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
fi

# Validate input directory
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Input directory '$INPUT_DIR' not found or is not a directory."
    exit 1
fi

# Resolve to absolute paths for clarity in messages
ABS_INPUT_DIR=$(realpath "$INPUT_DIR")
OUTPUT_DIR_PATH=$(dirname "$OUTPUT_FILE") # Get directory part of output file
# Ensure output directory is writable. If OUTPUT_FILE is just a filename, OUTPUT_DIR_PATH will be "."
# realpath "$OUTPUT_DIR_PATH" 2>/dev/null handles if OUTPUT_DIR_PATH is '.', '..', or invalid
# If realpath fails (e.g., path doesn't exist up to the parent), use OUTPUT_DIR_PATH directly for -w test
RESOLVED_OUTPUT_DIR_PATH=$(realpath "$OUTPUT_DIR_PATH" 2>/dev/null || echo "$OUTPUT_DIR_PATH")
if [ ! -w "$RESOLVED_OUTPUT_DIR_PATH" ]; then
    echo "Error: Output directory '$RESOLVED_OUTPUT_DIR_PATH' is not writable."
    exit 1
fi

# Confirmation if output file exists
if [ -f "$OUTPUT_FILE" ]; then
    read -p "Output file '$OUTPUT_FILE' already exists. Overwrite? (y/N): " confirm
    confirm_lower=$(echo "$confirm" | tr '[:upper:]' '[:lower:]')
    if [[ "$confirm_lower" != "y" ]]; then
        echo "Operation cancelled by user."
        exit 0
    fi
fi

echo "Starting operation..."
echo "Input directory: $ABS_INPUT_DIR"
echo "Output file:     $OUTPUT_FILE"
echo "================================================================================"

# Ensure output file is empty or created before writing anything
> "$OUTPUT_FILE"

echo ""
echo "PHASE 1: Listing all .js, .css, .html, .png files into '$OUTPUT_FILE'..."
echo "--------------------------------------------------------------------------------"

# Write header for file list to the output file
echo "--- LIST OF ALL .js, .css, .html, .png FILES IN: $ABS_INPUT_DIR ---" >> "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "(Excluding 'node_modules' directories)" >> "$OUTPUT_FILE"
echo "--------------------------------------------------------------------------------" >> "$OUTPUT_FILE"

file_list_count=0
# Find and list specified files (not directories), excluding node_modules
# -print0 and read -d $'\0' are robust for filenames with spaces, newlines, etc.
find "$ABS_INPUT_DIR" -name "node_modules" -type d -prune -o -type f \( -iname "*.js" -o -iname "*.css" -o -iname "*.html" -o -iname "*.png" \) -print0 | while IFS= read -r -d $'\0' listed_file; do
    # Get path relative to the input directory for cleaner listing
    relative_listed_file="${listed_file#$ABS_INPUT_DIR/}"
    echo "$relative_listed_file" >> "$OUTPUT_FILE"
    echo "Listed: $relative_listed_file" # Console feedback
    ((file_list_count++))
done

echo "--------------------------------------------------------------------------------" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE" # Add a blank line for separation

if [ "$file_list_count" -eq 0 ]; then
    echo "No .js, .css, .html, or .png files found in '$ABS_INPUT_DIR' or its subfolders to list."
    echo "(No files listed in '$OUTPUT_FILE' for Phase 1)" >> "$OUTPUT_FILE"
else
    echo "Listed $file_list_count file(s) (.js, .css, .html, .png) in '$OUTPUT_FILE'."
    echo "--- END OF FILE LIST ---" >> "$OUTPUT_FILE"
fi
echo "PHASE 1 Complete."
echo ""
echo "================================================================================"
echo ""
echo "PHASE 2: Combining .js, .css, and .html files into '$OUTPUT_FILE'..."
echo "--------------------------------------------------------------------------------"

# Add a header to the output file for the combined content section
echo "" >> "$OUTPUT_FILE"
echo "================================================================================" >> "$OUTPUT_FILE"
echo "--- START OF COMBINED .js, .css, AND .html FILES (from: $ABS_INPUT_DIR) ---" >> "$OUTPUT_FILE"
echo "(Excluding 'node_modules' directories)" >> "$OUTPUT_FILE"
echo "================================================================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

combined_file_count=0

# Find specific text files (.js, .css, .html) and process them for combination, excluding node_modules
find "$ABS_INPUT_DIR" -name "node_modules" -type d -prune -o -type f \( -iname "*.js" -o -iname "*.css" -o -iname "*.html" \) -print0 | while IFS= read -r -d $'\0' filepath; do
    echo "Processing for combination: $filepath" # Console feedback

    # Add a header indicating the start of a new file's content in the output file
    echo "================================================================================" >> "$OUTPUT_FILE"
    relative_filepath="${filepath#$ABS_INPUT_DIR/}"
    echo "FILE: $relative_filepath" >> "$OUTPUT_FILE"
    echo "================================================================================" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    # Append the content of the found file
    cat "$filepath" >> "$OUTPUT_FILE"

    # Add a couple of newlines after the file content for better separation
    echo "" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    ((combined_file_count++))
done

echo "--------------------------------------------------------------------------------"
if [ "$combined_file_count" -eq 0 ]; then
    echo "No .js, .css, or .html files found in '$ABS_INPUT_DIR' or its subfolders to combine."
    echo "(No .js, .css, or .html content appended in '$OUTPUT_FILE' for Phase 2)" >> "$OUTPUT_FILE"
else
    echo "Successfully combined $combined_file_count .js, .css, and/or .html files into '$OUTPUT_FILE'."
fi
echo "--- END OF COMBINED .js, .css, AND .html FILES ---" >> "$OUTPUT_FILE"
echo "PHASE 2 Complete."
echo ""
echo "================================================================================"
echo "Operation finished. Output is in '$OUTPUT_FILE'."