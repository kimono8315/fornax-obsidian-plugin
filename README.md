# Fornax: a Telescopic Writing Plugin for Obsidian

Fornax is a foundry for your sentences and paragraphs, an Obsidian plugin that gives you dedicated tabs for three discrete levels of writing.
It takes inspiration from Jordan Peterson's [essay writing guide](https://jordanbpeterson.com/wp-content/uploads/2018/02/Essay_Writing_Guide.docx)—something he wrote for his students—and the subsequent [web app](https://essay.app/guide/) that he and his son developed.

As Peterson states, "An essay, like any piece of writing, exists at multiple levels of resolution, simultaneously," the word, the sentence, the paragraph, and the outline.
Fornax allows you to edit your essay at the word, sentence, and paragraph levels in a playful, intuitive manner—it also adds a "spruced up" outline view to Obsidian.

For more information, see the [EXTENDED README.md](./EXTENDED%20README.md).

## Installation

1. Download the plugin files
2. Place in your Obsidian vault's `.obsidian/plugins/fornax-obsidian-plugin/` directory
3. Enable the plugin in Obsidian's Community Plugins settings
4. Access via the ribbon icon or command palette (`Ctrl/Cmd + P` → "Toggle Fornax Mode")

## Usage

1. Open any markdown file in Obsidian.
2. Click the Fornax ribbon icon to activate telescopic view.
3. Use the zoom controls to switch between Document, Paragraph, and Sentence panes.
4. Edit and reorganize content at each level as needed. Drag and drop your sentences and paragraphs. Hot swap alternative sentences.
5. Mark paragraphs complete when satisfied with their content

Fornax uses **non-destructive editing**: It preserves all your edits in the original markdown text file using invisible comment syntax that won't appear in reading view.

> [!IMPORTANT] 
> 
> **Line breaks**
>
> You must enable **strict line break**s in Obsidian (Settings > Editor > Strict line breaks = **on**) because Fornax relies on this feature of Markdown syntax.
> ```markdown
> # What you see in your editor
> 
> This is a sentence.
> This is another setnence, but markdown will see them both as a single paragraph.
>  
> This is a new paragraph.
> ```
> If this way of writing is something that you just can't get used to, you can do this *after* your first draft and before you start using Fornax. 
> Fornax doesn't pay attention to punctuation. 
> So whether you choose to break up sentences by periods only, or periods and semi-colons, is entirely up to you.
> 
> **Section headings**
> 
> ```markdown
> # First Level headings 
> 
> Are registered as the document title. 
> 
> ## Second Level headings 
> 
> Would then be your visual "first level," and so on down.
> ```


## Known Issues and Planned Features

- Doesn't handle adding line-breaks in the sentence proposal pain (e.g. you want to expand your current sentence into two new sentences, or begin a new paragraph of an existing sentence, etc.).
- Document view: there is no block for "introductory" material.
- How well does it support paragraphed bullet points?
- Bullets don't register as separate paragraphs in the paragraph pane.
- Markdown syntax isn't entirely rendered in the three views.
- Implement a "line break" button for those who don't want to write line-by-line. 
  The idea: after someone has finished writing their draft, they can simply click the button, and all of their paragraphs are broken up line-by-line.
	- Add a rejoin button?
	- Allow a choice between "periods" and "periods and semicolons" as break signifiers.
- Line breaks in bullet lists work fine. 
  Visually, they're not much to look at in the various panes. 
  Lower on the totem pole.
- Pie in the sky
	- Automated commit to repo feature, discreet units as validation that text was not copy and pasted. Small safety feature if one wanted to prove that their writing was not completely or primarily composed by an LLM.
	- Auto encryption feature: encrypt writing before saving to repo.