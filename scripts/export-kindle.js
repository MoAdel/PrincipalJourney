#!/usr/bin/env node
/**
 * ============================================================================
 * Principal Software Engineer Journey — Kindle EPUB Automated Exporter
 * Zero-dependency Node.js tool to compile curriculum modules into Kindle EPUBs.
 * Compatible with Amazon Send to Kindle (EPUB 3 + EPUB 2 NCX fallback).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// Root workspace directory
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = __dirname;
const DIST_DIR = path.join(WORKSPACE_ROOT, 'dist', 'kindle');
const CSS_PATH = path.join(SCRIPTS_DIR, 'kindle-style.css');

// Module metadata and display titles
const MODULE_CONFIGS = [
  { id: '00-Foundation', title: 'Sprint 00: Foundation & Mindset' },
  { id: '01-Production-Ready-WebAPI', title: 'Sprint 01: Production-Ready Web API' },
  { id: '01-Production-Ready-WebAPI-WarRoom', title: 'Sprint 01: Web API War Room Incidents' },
  { id: '02-Authentication', title: 'Sprint 02: Authentication & Identity Management' },
  { id: '03-Storage', title: 'Sprint 03: High-Throughput Cloud Storage' },
  { id: '04-Database', title: 'Sprint 04: Database Internals & Performance' },
  { id: '04-Database-WarRoom', title: 'Sprint 04: Database Meltdown War Room' },
  { id: '05-Concurrency', title: 'Sprint 05: Concurrency & Lock-Free Architecture' },
  { id: '05-Concurrency-WarRoom', title: 'Sprint 05: Concurrency Deadlock War Room' },
  { id: '06-Messaging', title: 'Sprint 06: Event-Driven Systems & Messaging Brokers' },
  { id: '07-Distributed-Systems', title: 'Sprint 07: Distributed Systems & Consensus' },
  { id: '08-Cloud-Native', title: 'Sprint 08: Cloud-Native & Serverless Architecture' },
  { id: '09-Observability', title: 'Sprint 09: Distributed Tracing & Telemetry' },
  { id: '10-System-Design', title: 'Sprint 10: Enterprise System Design & ADRs' },
];

// Logical Volumes grouping for combined books
const VOLUME_CONFIGS = [
  {
    id: 'Volume-1-WebAPI',
    title: 'Volume 1: Web API & Foundations',
    subtitle: 'From Clean Architecture to Production Resilience',
    modules: ['00-Foundation', '01-Production-Ready-WebAPI', '01-Production-Ready-WebAPI-WarRoom']
  },
  {
    id: 'Volume-2-Authentication',
    title: 'Volume 2: Identity, OAuth2 & Security',
    subtitle: 'Principal-Level Enterprise Security & Defense in Depth',
    modules: ['02-Authentication']
  },
  {
    id: 'Volume-3-DataEngineering',
    title: 'Volume 3: Storage & Database Engineering',
    subtitle: 'Physical Pages, MVCC, Indexing & High-Throughput Storage',
    modules: ['03-Storage', '04-Database', '04-Database-WarRoom']
  },
  {
    id: 'Volume-4-ConcurrencyMessaging',
    title: 'Volume 4: Concurrency & Messaging',
    subtitle: 'Lock-Free Hot Paths, Sagas, Outbox & Event-Driven Systems',
    modules: ['05-Concurrency', '05-Concurrency-WarRoom', '06-Messaging']
  },
  {
    id: 'Volume-5-DistributedCloud',
    title: 'Volume 5: Distributed Systems & Cloud-Native',
    subtitle: 'Consensus, Partitioning, Zero-Trust & FinOps',
    modules: ['07-Distributed-Systems', '08-Cloud-Native']
  },
  {
    id: 'Volume-6-ObservabilitySystemDesign',
    title: 'Volume 6: Observability & System Design',
    subtitle: 'High-Scale Telemetry, Failure Drills & Architecture Defense',
    modules: ['09-Observability', '10-System-Design']
  }
];

// ----------------------------------------------------------------------------
// 1. CRC32 & ZIP Packaging Engine (Zero External Dependencies)
// ----------------------------------------------------------------------------

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c;
}

function computeCRC32(buffer) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function dosDateTime(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

class EpubZipBuilder {
  constructor() {
    this.files = [];
  }

  addFile(name, content, options = {}) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    this.files.push({
      name: name.replace(/\\/g, '/'),
      buffer: buf,
      compress: options.compress !== false
    });
  }

  build() {
    const localHeaders = [];
    const centralHeaders = [];
    let currentOffset = 0;
    const now = new Date();
    const { dosTime, dosDate } = dosDateTime(now);

    for (const file of this.files) {
      const nameBuf = Buffer.from(file.name, 'utf8');
      const uncompressedSize = file.buffer.length;
      const crc = computeCRC32(file.buffer);

      let compressedBuf;
      let method;

      if (file.compress) {
        compressedBuf = zlib.deflateRawSync(file.buffer, { level: 9 });
        method = 8; // Deflated
      } else {
        compressedBuf = file.buffer;
        method = 0; // Stored (Uncompressed)
      }

      const compressedSize = compressedBuf.length;

      // Local file header (30 bytes + name)
      const localHdr = Buffer.alloc(30 + nameBuf.length);
      localHdr.writeUInt32LE(0x04034b50, 0); // Signature
      localHdr.writeUInt16LE(20, 4);         // Version needed
      localHdr.writeUInt16LE(0x0800, 6);     // Flags: UTF-8 filename
      localHdr.writeUInt16LE(method, 8);     // Method
      localHdr.writeUInt16LE(dosTime, 10);
      localHdr.writeUInt16LE(dosDate, 12);
      localHdr.writeUInt32LE(crc, 14);
      localHdr.writeUInt32LE(compressedSize, 18);
      localHdr.writeUInt32LE(uncompressedSize, 22);
      localHdr.writeUInt16LE(nameBuf.length, 26);
      localHdr.writeUInt16LE(0, 28);         // Extra field length
      nameBuf.copy(localHdr, 30);

      localHeaders.push(localHdr, compressedBuf);

      // Central directory header (46 bytes + name)
      const centralHdr = Buffer.alloc(46 + nameBuf.length);
      centralHdr.writeUInt32LE(0x02014b50, 0); // Signature
      centralHdr.writeUInt16LE(20, 4);         // Version made by
      centralHdr.writeUInt16LE(20, 6);         // Version needed
      centralHdr.writeUInt16LE(0x0800, 8);     // Flags: UTF-8
      centralHdr.writeUInt16LE(method, 10);
      centralHdr.writeUInt16LE(dosTime, 12);
      centralHdr.writeUInt16LE(dosDate, 14);
      centralHdr.writeUInt32LE(crc, 16);
      centralHdr.writeUInt32LE(compressedSize, 20);
      centralHdr.writeUInt32LE(uncompressedSize, 24);
      centralHdr.writeUInt16LE(nameBuf.length, 28);
      centralHdr.writeUInt16LE(0, 30);         // Extra len
      centralHdr.writeUInt16LE(0, 32);         // Comment len
      centralHdr.writeUInt16LE(0, 34);         // Disk start
      centralHdr.writeUInt16LE(0, 36);         // Internal attr
      centralHdr.writeUInt32LE(0, 38);         // External attr
      centralHdr.writeUInt32LE(currentOffset, 42); // Offset
      nameBuf.copy(centralHdr, 46);

      centralHeaders.push(centralHdr);
      currentOffset += localHdr.length + compressedBuf.length;
    }

    const centralDirOffset = currentOffset;
    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirSize = centralDirBuffer.length;

    // End of central directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.files.length, 8);
    eocd.writeUInt16LE(this.files.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
  }
}

// ----------------------------------------------------------------------------
// 2. Strict XHTML & Markdown Conversion Engine
// ----------------------------------------------------------------------------

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'section';
}

function isAsciiDiagram(text) {
  const boxChars = /[┌┐└┘├┤┬┴┼─│═║╔╗╚╝╠╣╦╩╬▲▼►◄◆●■]/;
  return boxChars.test(text);
}

function parseMarkdownToXhtml(mdContent, chapterContext = {}) {
  const lines = mdContent.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const headings = [];

  let inCode = false;
  let codeLang = '';
  let codeBuffer = [];

  let inTable = false;
  let tableRows = [];

  let inList = false;
  let listType = null; // 'ul' or 'ol'

  let inBlockquote = false;
  let quoteBuffer = [];

  function flushList() {
    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  }

  function flushBlockquote() {
    if (inBlockquote) {
      const fullQuote = quoteBuffer.join('\n').trim();
      const alertMatch = fullQuote.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*)$/i);
      if (alertMatch) {
        const type = alertMatch[1].toLowerCase();
        const alertBody = formatInlineText(alertMatch[2].trim());
        output.push(`<div class="alert alert-${type}"><div class="alert-title">${escapeXml(type)}</div><p>${alertBody}</p></div>`);
      } else {
        output.push(`<blockquote><p>${formatInlineText(fullQuote)}</p></blockquote>`);
      }
      quoteBuffer = [];
      inBlockquote = false;
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let html = '<table>';
      const hasHeader = tableRows.length >= 2 && tableRows[1].every(c => /^:?-+:?$/.test(c.trim()));
      
      if (hasHeader) {
        html += '<thead><tr>';
        for (const cell of tableRows[0]) {
          html += `<th>${formatInlineText(cell.trim())}</th>`;
        }
        html += '</tr></thead><tbody>';
        for (let i = 2; i < tableRows.length; i++) {
          html += '<tr>';
          for (const cell of tableRows[i]) {
            html += `<td>${formatInlineText(cell.trim())}</td>`;
          }
          html += '</tr>';
        }
        html += '</tbody>';
      } else {
        html += '<tbody>';
        for (const row of tableRows) {
          html += '<tr>';
          for (const cell of row) {
            html += `<td>${formatInlineText(cell.trim())}</td>`;
          }
          html += '</tr>';
        }
        html += '</tbody>';
      }
      html += '</table>';
      output.push(html);
      tableRows = [];
      inTable = false;
    }
  }

  function formatInlineText(text) {
    if (!text) return '';
    
    // First escape raw XML characters
    let res = escapeXml(text);

    // Markdown Links: [label](url)
    res = res.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
      // Map relative markdown links to chapter files or clean IDs
      if (href.endsWith('.md')) {
        const targetChapter = href.replace(/\.md$/, '.xhtml');
        return `<a href="${targetChapter}">${label}</a>`;
      }
      return `<a href="${href}">${label}</a>`;
    });

    // Inline Code: `code`
    res = res.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold + Italic: ***text***
    res = res.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');

    // Bold: **text**
    res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline Math: $p99$ or $Pool = ...$
    res = res.replace(/\$([^$]+)\$/g, '<span class="math-inline"><em>$1</em></span>');

    return res;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block start/end
    if (line.trim().startsWith('```')) {
      if (inCode) {
        // End of code block
        const codeText = codeBuffer.join('\n');
        if (codeLang === 'mermaid') {
          output.push(`<div class="diagram-card"><div class="diagram-card-title">Architecture Diagram (Mermaid)</div><pre><code>${escapeXml(codeText)}</code></pre></div>`);
        } else if (isAsciiDiagram(codeText)) {
          output.push(`<pre class="ascii-diagram"><code>${escapeXml(codeText)}</code></pre>`);
        } else {
          const header = codeLang ? `<div class="code-header">${escapeXml(codeLang.toUpperCase())}</div>` : '';
          output.push(`${header}<pre><code class="language-${escapeXml(codeLang || 'text')}">${escapeXml(codeText)}</code></pre>`);
        }
        codeBuffer = [];
        codeLang = '';
        inCode = false;
        continue;
      } else {
        flushList();
        flushBlockquote();
        flushTable();
        inCode = true;
        codeLang = line.trim().replace(/^```/, '').trim().toLowerCase();
        continue;
      }
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Markdown Tables (| cell | cell |)
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      flushBlockquote();
      inTable = true;
      const cells = line.trim().split('|');
      // Remove empty edges from split
      if (cells.length > 2) {
        tableRows.push(cells.slice(1, -1));
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Blockquotes (> text)
    if (/^\s*>\s*(.*)$/.test(line)) {
      flushList();
      const quoteText = line.trim().replace(/^>\s?/, '');
      inBlockquote = true;
      quoteBuffer.push(quoteText);
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Horizontal Rules
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      flushList();
      output.push('<hr/>');
      continue;
    }

    // Headings (# H1, ## H2, etc.)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const id = slugify(rawTitle) + '-' + headings.length;
      headings.push({ level, title: rawTitle, id });
      output.push(`<h${level} id="${id}">${formatInlineText(rawTitle)}</h${level}>`);
      continue;
    }

    // Unordered Lists (- or *)
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        flushList();
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${formatInlineText(ulMatch[1].trim())}</li>`);
      continue;
    }

    // Ordered Lists (1. 2.)
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList();
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${formatInlineText(olMatch[1].trim())}</li>`);
      continue;
    }

    // Blank line terminates lists
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Regular Paragraph
    flushList();
    output.push(`<p>${formatInlineText(line.trim())}</p>`);
  }

  flushList();
  flushBlockquote();
  flushTable();

  return {
    xhtml: output.join('\n'),
    headings
  };
}

// ----------------------------------------------------------------------------
// 3. EPUB Compilation & Packaging Orchestrator
// ----------------------------------------------------------------------------

function getModuleMarkdownFiles(moduleDir) {
  if (!fs.existsSync(moduleDir)) return [];
  const files = fs.readdirSync(moduleDir).filter(f => f.endsWith('.md'));
  
  // Natural sorting: README.md first, then 01, 02, 05, 05A, 06, etc.
  return files.sort((a, b) => {
    if (a.toLowerCase() === 'readme.md') return -1;
    if (b.toLowerCase() === 'readme.md') return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function buildEpubBook({ title, subtitle, bookId, chapters, cssContent, outputPath }) {
  const zip = new EpubZipBuilder();
  const bookUuid = 'urn:uuid:' + crypto.createHash('md5').update(bookId).digest('hex');
  const nowUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // 1. mimetype MUST be the very first file and uncompressed
  zip.addFile('mimetype', 'application/epub+zip', { compress: false });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.addFile('META-INF/container.xml', containerXml);

  // 3. OEBPS/style.css
  zip.addFile('OEBPS/style.css', cssContent);

  // 4. Chapters XHTML
  const manifestItems = [
    '<item id="css" href="style.css" media-type="text/css"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
  ];
  const spineItems = [];
  const ncxNavPoints = [];
  const navListItems = [];

  // Add Cover / Title Page
  const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="book-cover">
    <h1>${escapeXml(title)}</h1>
    ${subtitle ? `<div class="subtitle">${escapeXml(subtitle)}</div>` : ''}
    <hr/>
    <div class="meta">
      <p><strong>Principal Software Engineer Journey</strong></p>
      <p>Target: Staff / Principal Software Engineering Judgment</p>
      <p>Compiled for Amazon Kindle E-Readers</p>
    </div>
  </div>
</body>
</html>`;
  zip.addFile('OEBPS/cover.xhtml', coverXhtml);
  manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
  spineItems.push('<itemref idref="cover"/>');

  // Process Each Chapter
  chapters.forEach((ch, idx) => {
    const fileId = `chap_${idx + 1}`;
    const fileName = `${ch.filename.replace(/\.md$/, '')}.xhtml`;
    const chTitle = ch.headings.length > 0 ? ch.headings[0].title : ch.filename.replace(/\.md$/, '');

    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(chTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section class="chapter-container">
    ${ch.bodyXhtml}
  </section>
</body>
</html>`;

    zip.addFile(`OEBPS/${fileName}`, chapterXhtml);
    manifestItems.push(`<item id="${fileId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${fileId}"/>`);

    // TOC Entry for Nav & NCX
    navListItems.push(`<li><a href="${fileName}">${escapeXml(chTitle)}</a></li>`);
    ncxNavPoints.push(`  <navPoint id="np_${idx + 1}" playOrder="${idx + 1}">
    <navLabel><text>${escapeXml(chTitle)}</text></navLabel>
    <content src="${fileName}"/>
  </navPoint>`);
  });

  // 5. OEBPS/nav.xhtml (EPUB 3 Navigation Document)
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navListItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  zip.addFile('OEBPS/nav.xhtml', navXhtml);

  // 6. OEBPS/toc.ncx (EPUB 2 / Kindle Legacy Navigation)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookUuid}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <docAuthor><text>Principal Software Engineer Journey</text></docAuthor>
  <navMap>
${ncxNavPoints.join('\n')}
  </navMap>
</ncx>`;
  zip.addFile('OEBPS/toc.ncx', tocNcx);

  // 7. OEBPS/content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${bookUuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Principal Software Engineer Academy</dc:creator>
    <dc:publisher>Principal Journey</dc:publisher>
    <meta property="dcterms:modified">${nowUtc}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.addFile('OEBPS/content.opf', contentOpf);

  // Build binary zip buffer
  const epubBuffer = zip.build();

  // Ensure output directory exists and write
  const targetDir = path.dirname(outputPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, epubBuffer);

  return {
    outputPath,
    sizeBytes: epubBuffer.length,
    chapterCount: chapters.length
  };
}

// ----------------------------------------------------------------------------
// 4. CLI & Execution Commands
// ----------------------------------------------------------------------------

function loadCss() {
  if (fs.existsSync(CSS_PATH)) {
    return fs.readFileSync(CSS_PATH, 'utf8');
  }
  return 'body { font-family: serif; line-height: 1.5; } pre { background: #eee; padding: 5px; }';
}

function exportModule(moduleId, outDir = DIST_DIR) {
  const modCfg = MODULE_CONFIGS.find(m => m.id.toLowerCase() === moduleId.toLowerCase() || m.id.startsWith(moduleId));
  const targetId = modCfg ? modCfg.id : moduleId;
  const targetTitle = modCfg ? modCfg.title : targetId;
  const modulePath = path.join(WORKSPACE_ROOT, targetId);

  if (!fs.existsSync(modulePath)) {
    console.error(`❌ Module directory not found: ${modulePath}`);
    return null;
  }

  const mdFiles = getModuleMarkdownFiles(modulePath);
  if (mdFiles.length === 0) {
    console.warn(`⚠️ No markdown files found in module: ${targetId}`);
    return null;
  }

  console.log(`\n📦 Compiling eBook: ${targetTitle}...`);
  console.log(`   Found ${mdFiles.length} lessons in ${targetId}`);

  const chapters = [];
  for (const file of mdFiles) {
    const fullPath = path.join(modulePath, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const parsed = parseMarkdownToXhtml(content, { module: targetId, filename: file });
    chapters.push({
      filename: file,
      bodyXhtml: parsed.xhtml,
      headings: parsed.headings
    });
  }

  const css = loadCss();
  const outFile = path.join(outDir, `PrincipalJourney-${targetId}.epub`);
  const result = buildEpubBook({
    title: targetTitle,
    subtitle: 'Principal Software Engineer Curriculum',
    bookId: `principal-journey-${targetId}`,
    chapters,
    cssContent: css,
    outputPath: outFile
  });

  const sizeKb = (result.sizeBytes / 1024).toFixed(1);
  console.log(`   ✅ Generated Kindle EPUB: ${path.basename(outFile)} (${sizeKb} KB, ${result.chapterCount} chapters)`);
  return result;
}

function exportVolume(volCfg, outDir = DIST_DIR) {
  console.log(`\n📚 Compiling Volume: ${volCfg.title}...`);
  const chapters = [];

  for (const modId of volCfg.modules) {
    const modulePath = path.join(WORKSPACE_ROOT, modId);
    if (!fs.existsSync(modulePath)) continue;

    const mdFiles = getModuleMarkdownFiles(modulePath);
    for (const file of mdFiles) {
      const fullPath = path.join(modulePath, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const parsed = parseMarkdownToXhtml(content, { module: modId, filename: file });
      chapters.push({
        filename: `${modId}_${file}`,
        bodyXhtml: parsed.xhtml,
        headings: parsed.headings
      });
    }
  }

  const css = loadCss();
  const outFile = path.join(outDir, `PrincipalJourney-${volCfg.id}.epub`);
  const result = buildEpubBook({
    title: volCfg.title,
    subtitle: volCfg.subtitle,
    bookId: `principal-journey-${volCfg.id}`,
    chapters,
    cssContent: css,
    outputPath: outFile
  });

  const sizeKb = (result.sizeBytes / 1024).toFixed(1);
  console.log(`   ✅ Generated Volume EPUB: ${path.basename(outFile)} (${sizeKb} KB, ${result.chapterCount} chapters)`);
  return result;
}

function exportOmnibus(outDir = DIST_DIR) {
  console.log(`\n👑 Compiling Complete Omnibus Edition (All Modules)...`);
  const chapters = [];

  for (const modCfg of MODULE_CONFIGS) {
    const modulePath = path.join(WORKSPACE_ROOT, modCfg.id);
    if (!fs.existsSync(modulePath)) continue;

    const mdFiles = getModuleMarkdownFiles(modulePath);
    for (const file of mdFiles) {
      const fullPath = path.join(modulePath, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const parsed = parseMarkdownToXhtml(content, { module: modCfg.id, filename: file });
      chapters.push({
        filename: `${modCfg.id}_${file}`,
        bodyXhtml: parsed.xhtml,
        headings: parsed.headings
      });
    }
  }

  const css = loadCss();
  const outFile = path.join(outDir, `PrincipalJourney-Complete-Omnibus.epub`);
  const result = buildEpubBook({
    title: 'Principal Software Engineer Journey (Complete Omnibus)',
    subtitle: 'The 12-Week Architectural & Engineering Mastery Curriculum',
    bookId: 'principal-journey-complete-omnibus',
    chapters,
    cssContent: css,
    outputPath: outFile
  });

  const sizeKb = (result.sizeBytes / 1024).toFixed(1);
  console.log(`   ✅ Generated Complete Omnibus: ${path.basename(outFile)} (${sizeKb} KB, ${result.chapterCount} chapters)`);
  return result;
}

// ----------------------------------------------------------------------------
// Main CLI Entry Point
// ----------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  let targetModule = null;
  let doAll = false;
  let doVolumes = false;
  let doOmnibus = false;
  let doList = false;
  let customOut = DIST_DIR;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--module' || arg === '-m') {
      targetModule = args[++i];
    } else if (arg === '--all' || arg === '-a') {
      doAll = true;
    } else if (arg === '--volumes' || arg === '-v') {
      doVolumes = true;
    } else if (arg === '--omnibus') {
      doOmnibus = true;
    } else if (arg === '--list' || arg === '-l') {
      doList = true;
    } else if (arg === '--out' || arg === '-o') {
      customOut = path.resolve(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    }
  }

  console.log(`================================================================`);
  console.log(`🚀 Principal Software Engineer Journey — Kindle EPUB Generator`);
  console.log(`================================================================`);

  if (doList) {
    console.log(`\nAvailable Modules:`);
    MODULE_CONFIGS.forEach(m => console.log(`  • ${m.id.padEnd(35)} : ${m.title}`));
    console.log(`\nAvailable Volumes:`);
    VOLUME_CONFIGS.forEach(v => console.log(`  • ${v.id.padEnd(35)} : ${v.title}`));
    return;
  }

  if (targetModule) {
    exportModule(targetModule, customOut);
  } else if (doVolumes) {
    for (const vol of VOLUME_CONFIGS) {
      exportVolume(vol, customOut);
    }
  } else if (doOmnibus) {
    exportOmnibus(customOut);
  } else if (doAll) {
    console.log(`\nCompiling all 14 individual module eBooks...`);
    for (const mod of MODULE_CONFIGS) {
      exportModule(mod.id, customOut);
    }
    console.log(`\nCompiling the 6 grouped study volumes...`);
    for (const vol of VOLUME_CONFIGS) {
      exportVolume(vol, customOut);
    }
    exportOmnibus(customOut);
  } else {
    // Default action: Export 02-Authentication if no flag is passed!
    console.log(`\nℹ️  No module specified. Defaulting to: 02-Authentication`);
    console.log(`   (Use --all for all modules, or --help for full options)`);
    exportModule('02-Authentication', customOut);
  }

  console.log(`\n✨ Output directory: ${customOut}`);
  console.log(`   Upload these .epub files to: https://www.amazon.com/sendtokindle`);
}

function printHelp() {
  console.log(`
Usage:
  node scripts/export-kindle.js [options]

Options:
  --module, -m <name|number>  Export a specific module (e.g. 02, 02-Authentication)
  --all, -a                   Export all individual modules, volumes, and omnibus
  --volumes, -v               Export the 6 grouped study volumes
  --omnibus                   Export the single complete omnibus book
  --list, -l                  List all available modules and volumes
  --out, -o <dir>             Specify custom output directory (default: dist/kindle)
  --help, -h                  Display this help message

Examples:
  node scripts/export-kindle.js -m 02-Authentication
  node scripts/export-kindle.js -m 02
  node scripts/export-kindle.js --volumes
  node scripts/export-kindle.js --all
`);
}

main();
