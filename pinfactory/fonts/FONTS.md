# Bundled fonts

All fonts here are licensed under the **SIL Open Font License 1.1** (OFL), which
permits bundling and redistribution. The full license text for each family is in
the matching `*-OFL.txt` file in this folder.

| Family | Files | Role in templates |
| --- | --- | --- |
| **Gloock** | `Gloock-Regular.ttf` | Dramatic high-contrast display serif — default headlines. |
| **Crimson Pro** | `CrimsonPro-{Regular,Bold,Italic}.ttf` | Alternate headline / editorial serif. |
| **Lora** | `Lora-{Regular,Bold,Italic}.ttf` | Body serif and the italic trope-hook line. |
| **Work Sans** | `WorkSans-{Regular,Bold}.ttf` | Kickers, tags, small caps labels. |
| **Outfit** | `Outfit-Bold.ttf` | Geometric sans option. |
| **Italiana** | `Italiana-Regular.ttf` | Elegant fashion serif — good for fantasy/luxe palettes. |
| **Nothing You Could Do** | `NothingYouCouldDo-Regular.ttf` | Handwritten accent (pen-name flourish on quote cards). |

Reference any of these by filename in `themes.yaml` under a pen name's `fonts:`
block. To add your own licensed fonts, drop the `.ttf` in a project-local
`fonts/` folder (which takes precedence over these bundled ones) and name it in
`themes.yaml`.

Each font is © its respective authors; see the individual `*-OFL.txt` files for
attribution and the license terms.
