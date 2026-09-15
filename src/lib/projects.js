function worksMedia(slug, pairCount) {
    const blocks = []
    for (let i = 1; i <= pairCount; i++) {
        blocks.push({ type: 'image', src: `/images/works/${slug}/pic0${i}.avif` })
        blocks.push({ type: 'video', src: `/images/works/${slug}/movie0${i}.mp4` })
    }
    return {
        movieMain: `/images/works/${slug}/movie-main.mp4`,
        blocks,
        spBlocks: [
            { type: 'image', src: `/images/works/${slug}/sp-pic01.avif` },
            { type: 'video', src: `/images/works/${slug}/sp-movie01.mp4` },
        ],
    }
}

export async function getProjects() {
    return [
        {
            slug: "mikimoto",
            title: "MIKIMOTO",
            role: "motion design / WebGL / development",
            date: "2026",
            links: [
                { label: "View Project", href: "https://mypearls.mikimoto.com/thelayersoflight" },
            ],
            descriptionEn: "A MIKIMOTO campaign site headlined by Number_i’s Yuta Jinguji. It traces over 130 years of craft with him, showing the making of a single ring as layers of WebGL light and scroll.<br/>Loading holds the intro until assets and the crystal are ready, mapping progress onto the logo fill so the wait itself belongs to the experience. Brilliance and placement were refined again and again in a debug GUI, pursuing the gem’s fleeting sparkle and texture on screen.",
            description: "Number_i 神宮寺勇太さんを起用したMIKIMOTOキャンペーンサイト。130年を超える技と美意識をともに辿り、ひとつのリングが完成するまでの工程を、WebGLの光とスクロールで層のように見せています。<br/>ローディングではアセットとクリスタルの準備を揃えてからイントロを開始し、ロゴの塗りに進捗を重ねることで待ち時間そのものを体験の一部にしました。輝きや配置はdebug GUIで繰り返し調整し、一瞬の宝石の輝きと質感を画面上で追求しました。",
            ...worksMedia("mikimoto", 2),
        },
        {
            slug: "gorakadan",
            title: "Gorakadan",
            role: "motion design / development",
            date: "2025",
            links: [
                { label: "Brand", href: "https://www.gorakadan.com/" },
                { label: "FUJI", href: "https://www.gorakadan.com/fuji/" },
                { label: "GOLF", href: "https://www.gorakadan.com/fuji/golf/" },
            ],
            descriptionEn: "Three sites made as the historic Hakone inn grew into a resort brand spanning Fuji’s hotel and golf course: the brand site, GORA KADAN FUJI, and GORA KADAN FUJI GOLF, each with its own role on a shared aesthetic.<br/>Motion was tuned again and again so quality and composure arrive slowly, quietly, and on axis, without losing the space between. Each site runs on WordPress, built with day-to-day updates in mind.",
            description: "箱根・強羅の老舗旅館が、富士の宿とゴルフ場までを束ねるリゾートブランドへと広がるタイミングで制作した3サイト。ブランドサイト、GORA KADAN FUJI、GORA KADAN FUJI GOLFを、同じ美意識の上で役割を分けて設計しました。<br/>上質と品が、ゆっくり、静かに、軸を保ったまま届くよう、動きの間と余白を何度も調整して実装しています。それぞれWordPressで、更新しやすい運用も見据えています。",
            ...worksMedia("gorakadan", 3),
        },
        {
            slug: "tsukilio",
            title: "Tsukilio",
            role: "motion design / development",
            date: "2026",
            links: [
                { label: "View Project", href: "https://www.tsuklio.com/" },
            ],
            descriptionEn: "The brand site renewed when Tsukurioki.jp was rebranded as Tsuklio, with a new logo, graphic system, and packaging. Weekly menus and news are gathered into an experience that carries warmth and richness.<br/>Built with Astro, microCMS, and Cloudflare Workers, it deploys on a daily schedule so CMS updates land on the live site without extra ops. Section titles express the color of the menu and the mood of the table through subtle shifts in hue and motion.",
            description: "「つくりおき.jp」から「ツクリオ」へリブランディングし、ロゴ・装飾・パッケージを一新したタイミングで刷新したブランドサイト。週替わりのメニューやニュースを、温かさと豊かさが伝わる体験としてまとめています。<br/>Astro, microCMS, Cloudflare Workersで構築し、毎日決まった時刻にデプロイが走るようにして、CMSの更新がサイトへ自然に乗る運用にしました。セクションタイトルはメニューの彩りと食卓の雰囲気を色と移る細かな演出で表現しています。",
            ...worksMedia("tsukilio", 2),
        },
        {
            slug: "canadagoose",
            title: "Canada Goose",
            role: "motion design / development",
            date: "2024",
            siteClosed: true,
            descriptionEn: "A special site for “FUMI NIKAIDO AND THE ART OF CRAFTSMANSHIP,” the photo exhibition marking the opening of CANADA GOOSE’s Ginza flagship. Portraits by Fumi Nikaido — of the brand and of Ginza’s craftspeople — sit in a layout with room to breathe.<br/>Motion stays quiet to match that simple, refined frame: a logo intro, fades, and parallax held in a calm register. The top is a static LP, but the craftsman pages share one template, so each is kept as an Astro Markdown file.",
            description: "CANADA GOOSE 銀座フラッグシップストアのオープンを記念した、写真展「FUMI NIKAIDO AND THE ART OF CRAFTSMANSHIP」の特設サイト。写真家・二階堂ふみが捉えた、ブランドと銀座の職人たちのポートレートを、余白のある画面で見せています。<br/>シンプルで洗練されたレイアウトに合うよう、ロゴの導入やフェード、パララックスは落ち着いたトーンに抑えて構築しました。トップは静的なLPですが、同じ型の職人紹介が下層に並ぶため、各頁をAstroのMarkdownで管理できる形にしています。",
            ...worksMedia("canadagoose", 3),
        },
        {
            slug: "seitarodesign",
            title: "Seitaro Design",
            role: "motion design / WebGL / development",
            date: "2024",
            links: [
                { label: "Seitaro Design", href: "https://seitaro-design.com" },
                { label: "Seitaro Design Group", href: "https://seitaro.group" },
            ],
            descriptionEn: "The Seitaro Design corporate site and the group site that gathers branding, space, and art under one roof. Both are headless on microCMS, built for page speed and easy content updates.<br/>On Seitaro Design, several transition animations are ready — some of them draggable. After each move, one fires at random and overlaps the last instead of cutting it off, so chaos and the brand sit in the same air. On the Group site, physics is calculated in WebGL behind the scenes, then passed to the DOM so CSS can tune shape and color — a gravity that plays across the page.<br/>*When adding objects, you may occasionally get a rare one that moves differently from the rest.",
            description: "セイタロウデザインのコーポレートサイトと、ブランディングから空間・アートまでを束ねるグループサイト。どちらもmicroCMSのヘッドレス構成で、表示速度とコンテンツの更新しやすさを両立しています。<br/>Seitaro Designでは複数の遷移アニメーションを用意し、一部はドラッグにも対応。遷移後はランダムに発火させ、直前の動きを途切れさせず重ねることで、カオスとブランドが共存する空気を作っています。Groupでは物理演算をWebGLで裏計算し、数値をDOMへ渡してCSSで形と色を整えることで、ページ全体に重力があるような遊びを載せています。<br/>※オブジェクトを追加する際、稀に他と動きの違うレアモノがあります。",
            ...worksMedia("seitarodesign", 3),
        },
        {
            slug: "edifice",
            title: "EDIFICE",
            role: "motion design / creative coding",
            date: "2024",
            links: [
                { label: "View Project", href: "https://baycrews.jp/feature/detail/12415" },
            ],
            descriptionEn: "A 30th-anniversary site for EDIFICE, whose modern casual has long been rooted in French chic. The brand’s accumulated air is shown through film, music, and a bookshelf.<br/>The player is built on the Web Audio API. Tracks are decoded and looped, run through gain and a three-band EQ, then drawn as frequency bars from an AnalyserNode. Playback rate can change, and books on the shelf can switch tracks.",
            description: "フレンチシックを軸に大人のカジュアルを提案してきた EDIFICE の30周年特設サイト。積み重ねてきたブランドの空気を、映像と音楽、本棚のギミックで見せています。<br/>音楽プレイヤーはWeb Audio APIで組んでおり、曲をデコードしてループ再生し、GainとEQ（低域・中域・高域）を通したうえで、Analyserの周波数をバーに描画。再生速度の切り替えや、本棚の本からの曲切り替えも出来ます。",
            ...worksMedia("edifice", 3),
        },
        {
            slug: "jde",
            title: "Journal du ete",
            role: "motion design / development",
            date: "2023",
            links: [
                { label: "View Project", href: "https://journalduete.eteweb.com/" },
            ],
            descriptionEn: "A web magazine for ete, a jewelry brand that adds a pinch of play to simple beauty. Seasonal features and the brand’s lasting identity sit side by side, showing ete from more than one angle.<br/>Content is managed in WordPress, and pages transition asynchronously. First-load animation and page transitions move the logo and the view slowly, so the quiet air of a jewelry magazine doesn’t break between screens.",
            description: "シンプルな美しさに、ひとさじの遊び心を添えるジュエリーブランドeteのウェブマガジン。シーズンの企画からブランドの普遍的なアイデンティティまで、記事の切り口で多面を伝えています。<br/>コンテンツはWordPressで管理し、ページは非同期遷移でつなぎます。初回のローディングとページトランジションでロゴと画面がゆっくり切り替わり、ジュエリーメディアらしい静かな空気を途切れさせないようにしています。",
            ...worksMedia("jde", 2),
        },
    ]
}

export async function getProject(slug) {
    const projects = await getProjects()
    return projects.find((project) => project.slug === slug)
}
