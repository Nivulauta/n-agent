# Markdown Rendering in Chat Window

## Overview
Added markdown rendering support for assistant responses in the chat interface. User messages remain as plain text, while assistant responses are rendered with full markdown formatting including headers, lists, code blocks, tables, and more.

## Features

### Supported Markdown Elements

1. **Headers** (H1-H6)
   - H1 includes bottom border
   - Proper sizing and spacing

2. **Text Formatting**
   - **Bold** text
   - *Italic* text
   - ~~Strikethrough~~ (with GFM plugin)

3. **Lists**
   - Unordered lists (bullets)
   - Ordered lists (numbers)
   - Nested lists

4. **Code**
   - Inline `code` with background
   - Code blocks with syntax highlighting
   - Proper font family (monospace)

5. **Links**
   - Clickable links with hover effect
   - Blue color (#007bff)

6. **Blockquotes**
   - Left border accent
   - Light background
   - Proper padding

7. **Tables** (with GFM plugin)
   - Bordered cells
   - Header row styling
   - Alternating row colors

8. **Horizontal Rules**
   - Divider lines

9. **Task Lists** (with GFM plugin)
   - [ ] Unchecked items
   - [x] Checked items

## Implementation

### Dependencies Added

```json
{
  "dependencies": {
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0"
  }
}
```

- **react-markdown**: Core markdown rendering library
- **remark-gfm**: GitHub Flavored Markdown plugin (tables, task lists, strikethrough)

### Files Modified

1. **frontend/package.json**
   - Added react-markdown and remark-gfm dependencies

2. **frontend/src/components/Message.tsx**
   - Added ReactMarkdown component for assistant messages
   - User messages remain plain text
   - Imported remarkGfm plugin

3. **frontend/src/components/ChatWindow.tsx**
   - Added ReactMarkdown for streaming content
   - Consistent rendering between streaming and completed messages

4. **frontend/src/components/Message.css**
   - Added comprehensive markdown styling
   - Headers, lists, code blocks, tables, etc.

5. **frontend/src/components/ChatWindow.css**
   - Added same markdown styling for streaming messages
   - Consistent appearance

## Installation

### Step 1: Install Dependencies
```bash
cd frontend
npm install
```

This will install:
- react-markdown@^9.0.1
- remark-gfm@^4.0.0

### Step 2: Build and Run
```bash
npm run dev
```

## Usage

### In Assistant Responses

The AI can now use markdown in responses:

```markdown
# Main Title

Here's some **bold text** and *italic text*.

## Code Example

Here's some inline `code` and a code block:

\`\`\`javascript
function hello() {
    console.log("Hello, world!");
}
\`\`\`

## Lists

- Item 1
- Item 2
  - Nested item
  - Another nested item

## Table

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
| Data 3   | Data 4   |

## Task List

- [x] Completed task
- [ ] Pending task
```

### Rendering Behavior

- **User Messages**: Plain text (no markdown rendering)
- **Assistant Messages**: Full markdown rendering
- **Streaming Messages**: Markdown rendered in real-time as content arrives

## Styling

### Code Blocks
- Light gray background (#f6f8fa)
- Border for definition
- Horizontal scrolling for long lines
- Monospace font

### Tables
- Bordered cells
- Header row with gray background
- Alternating row colors for readability

### Blockquotes
- Blue left border (#007bff)
- Light background (#f8f9fa)
- Indented with padding

### Links
- Blue color (#007bff)
- Underline on hover
- Opens in same tab (can be modified)

## Customization

### Adding Syntax Highlighting

To add syntax highlighting for code blocks, install additional plugins:

```bash
npm install rehype-highlight
```

Then update the components:

```typescript
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

<ReactMarkdown 
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
>
    {content}
</ReactMarkdown>
```

### Custom Link Behavior

To open links in new tab:

```typescript
<ReactMarkdown 
    remarkPlugins={[remarkGfm]}
    components={{
        a: ({node, ...props}) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
        )
    }}
>
    {content}
</ReactMarkdown>
```

### Custom Code Block Styling

```typescript
<ReactMarkdown 
    remarkPlugins={[remarkGfm]}
    components={{
        code: ({node, inline, className, children, ...props}) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
                <SyntaxHighlighter
                    language={match[1]}
                    PreTag="div"
                    {...props}
                >
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            ) : (
                <code className={className} {...props}>
                    {children}
                </code>
            );
        }
    }}
>
    {content}
</ReactMarkdown>
```

## Examples

### Example 1: Technical Documentation

**Input:**
```markdown
## API Endpoint

Use the following endpoint to upload documents:

\`\`\`
POST /documents/upload
\`\`\`

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Response:**
\`\`\`json
{
  "documentId": "doc-123",
  "uploadUrl": "https://..."
}
\`\`\`
```

**Output:** Fully formatted with headers, code blocks, and lists

### Example 2: Step-by-Step Guide

**Input:**
```markdown
# How to Upload a Document

Follow these steps:

1. Click the **Upload** button
2. Select a PDF file (max 100MB)
3. Wait for the upload to complete
4. View your document in the list

> **Note:** Only PDF files are supported.
```

**Output:** Formatted with numbered list and blockquote

### Example 3: Comparison Table

**Input:**
```markdown
## Feature Comparison

| Feature | Free | Premium |
|---------|------|---------|
| Documents | 10 | Unlimited |
| Storage | 1GB | 100GB |
| Support | Email | 24/7 |
```

**Output:** Formatted table with borders and styling

## Performance

### Optimization Tips

1. **Memoization**: Consider memoizing markdown rendering for large messages
2. **Lazy Loading**: Load markdown library only when needed
3. **Virtual Scrolling**: For long chat histories with many messages

### Bundle Size

- react-markdown: ~50KB (gzipped)
- remark-gfm: ~10KB (gzipped)
- Total addition: ~60KB

## Accessibility

The markdown rendering maintains accessibility:
- Semantic HTML elements (h1-h6, ul, ol, table)
- Proper heading hierarchy
- Alt text support for images (if added)
- Keyboard navigation for links

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Troubleshooting

### Markdown Not Rendering

1. Check that dependencies are installed:
   ```bash
   npm list react-markdown remark-gfm
   ```

2. Verify imports in components:
   ```typescript
   import ReactMarkdown from 'react-markdown';
   import remarkGfm from 'remark-gfm';
   ```

3. Check browser console for errors

### Styling Issues

1. Ensure CSS files are imported
2. Check for CSS conflicts with other styles
3. Verify class names match between JSX and CSS

### Performance Issues

1. Profile with React DevTools
2. Consider memoizing ReactMarkdown component
3. Limit message history length

## Future Enhancements

Potential improvements:
1. Syntax highlighting for code blocks
2. Math equation support (KaTeX)
3. Mermaid diagram support
4. Image rendering
5. Copy button for code blocks
6. Collapsible sections
7. Custom emoji support

## Related Files

- `frontend/src/components/Message.tsx` - Message component with markdown
- `frontend/src/components/ChatWindow.tsx` - Streaming message rendering
- `frontend/src/components/Message.css` - Markdown styling
- `frontend/src/components/ChatWindow.css` - Streaming markdown styling
- `frontend/package.json` - Dependencies

## Testing

Test markdown rendering with various inputs:

```javascript
// In chat, send messages with markdown
"Can you format this as a table?"
"Show me a code example"
"Create a numbered list"
```

The assistant's responses will be rendered with full markdown formatting.
