# Project Styling Guidelines

- **UI Framework**: Use standard Tailwind CSS utility classes exclusively.
- **No Arbitrary Values**: Avoid using square bracket notation (e.g., `text-[10px]`, `w-[245px]`) or inline hex codes (e.g., `text-[#2898f1]`). Always use standard Tailwind scales.
- **Primary Color Palette**: The primary brand palette is built around **Blue**. Use `blue-400`, `blue-500`, and `blue-600` as the dominant colors for accents, buttons, and highlights.
- **Icon Library**: Use `lucide-react` for all icons.
- **Color Standards**: 
    - **Primary Colors**: Use the defined primary color palette for all interactive elements and brand-related components.
    - **Neutral Colors**: Utilize neutral shades for backgrounds, borders, and subtle UI elements.
    - **Chart Colors**: Use the defined chart color palette for all data visualization elements. ["#3fb1e3", "#6be6c1", "#626c91", "#a0a7e6", "#c4ebad", "#96dee8"
]
- **Typography Standards**: 
    - **Never use `font-black`**. Use `font-bold` for primary headings and `font-semibold` for sub-headings or emphasized text.
    - **Information Hierarchy**: Establish hierarchy through a balanced combination of font-weight and color.
        - Primary titles: `text-text-base` + `font-bold`.
        - Secondary content: `text-text-muted` + `font-medium`.
        - Meta-data/Captions: `text-text-muted/80` + `font-semibold` + `uppercase` + `text-xs`.
- **Consistency**: Ensure all new components and modifications adhere to these standard scales for spacing, typography, and color to maintain a professional and unified interface.

# Table Styling Guidelines

- **Header Text**: All table headers must be uppercase.
- **Unit Display**: If a column has a unit (e.g., tỷ VNĐ, %), it must be displayed on a separate line directly below the main title.
- **Header Layout**:
    - Line 1: Column Title (Uppercase, no wrapping).
    - Line 2: Unit (e.g., `(Tỷ VNĐ)`).
- **No Wrapping**: Column titles must stay on a single line. Use `whitespace-nowrap` to prevent titles from breaking into multiple lines.
- **Standard Header Styling**: `text-[10px] font-bold uppercase tracking-wider whitespace-nowrap`.

# Chart Styling Guidelines

- **Color Palette**: Use the following palette for all charts (ECharts/D3):
    `['#4D93F9', '#F56B2D', '#23C68E', '#F55A5A', '#F8B011', '#9974F8', '#F05DA8', '#14C6E4', '#7279F5', '#94D926']`
- **Color Ordering**:
    - Use colors sequentially based on series index.
    - Series 1 (Index 0) -> `#4D93F9`
    - Series 2 (Index 1) -> `#F56B2D`
    - And so on.
    - If the number of series exceeds the palette size, loop back to the beginning.
- **Fixed Assignment**: Colors must remain fixed for each series across renders. Do not use random color assignment.
