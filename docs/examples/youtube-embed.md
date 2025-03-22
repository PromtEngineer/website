---
description: Examples of how to embed YouTube videos in MkDocs
---

# YouTube Video Embedding Examples

## Method 1: Using HTML iframe

You can embed a YouTube video directly using an HTML iframe. This is the most common method:

```html
<iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
```

Replace `VIDEO_ID` with your actual YouTube video ID. For example, if your YouTube URL is `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, the video ID is `dQw4w9WgXcQ`.

Here's a live example:

<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## Method 2: Using Material for MkDocs Admonitions

You can combine admonitions with iframes for a nicer presentation:

```markdown
!!! video "Video Title"
    <iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
```

Here's how it looks:

!!! video "Sample YouTube Video"
    <iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## Method 3: Responsive Embedding

For responsive videos that adjust to screen size, you can use this CSS approach:

```html
<div class="video-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>
```

With this CSS in your `docs/stylesheets/extra.css` file:

```css
.video-wrapper {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  height: 0;
  overflow: hidden;
  max-width: 100%;
}

.video-wrapper iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
```

## Method 4: Using a Plugin

If you prefer using a plugin, you can install the `mkdocs-video` plugin. Add it to your `requirements-doc.txt` file:

```
mkdocs-video
```

Then add it to your `mkdocs.yml` file:

```yaml
plugins:
  - search
  - mkdocs-video
```

And use it in your Markdown:

```markdown
![type:video](https://www.youtube.com/embed/VIDEO_ID)
```

## Getting the YouTube Video ID

The video ID is the part of the YouTube URL after `v=`. For example:

- Full URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- Video ID: `dQw4w9WgXcQ`

You can also get the embed URL directly from YouTube by:
1. Going to the video on YouTube
2. Clicking "Share"
3. Clicking "Embed"
4. Copying the iframe code provided 