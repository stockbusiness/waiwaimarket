import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown/parse";

/**
 * 本部が編集した本文の描画。
 *
 * `lib/markdown/parse.ts` が返した構造から React のノードを組み立てる。
 * 文字列を HTML として渡す経路が無いので、本文に何が書かれていても
 * 文字として表示されるだけになる。
 */

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={index} className="font-bold">
            {node.value}
          </strong>
        );
      case "break":
        return <br key={index} />;
      case "link": {
        // 外部リンクは新しいタブで開き、参照元を渡さない。
        // 内部リンクは Link にして遷移を速くする
        const isInternal = node.href.startsWith("/");
        return isInternal ? (
          <Link key={index} href={node.href} className="rounded-sm text-link hover:underline">
            {node.label}
          </Link>
        ) : (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm text-link hover:underline"
          >
            {node.label}
          </a>
        );
      }
    }
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 key={index} className="mt-8 text-lg font-bold tracking-tight first:mt-0 sm:text-xl">
          {renderInline(block.children)}
        </h2>
      ) : (
        <h3 key={index} className="mt-6 text-base font-bold first:mt-0">
          {renderInline(block.children)}
        </h3>
      );

    case "paragraph":
      return (
        <p key={index} className="mt-4 text-sm leading-7 first:mt-0">
          {renderInline(block.children)}
        </p>
      );

    case "list": {
      const className = "mt-4 flex flex-col gap-2 pl-6 text-sm leading-7 first:mt-0";
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex} className="list-outside">
          {renderInline(item)}
        </li>
      ));
      return block.ordered ? (
        <ol key={index} className={`${className} list-decimal`}>
          {items}
        </ol>
      ) : (
        <ul key={index} className={`${className} list-disc`}>
          {items}
        </ul>
      );
    }

    case "rule":
      return <hr key={index} className="mt-8 border-line first:mt-0" />;
  }
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return <div className="text-body">{blocks.map(renderBlock)}</div>;
}
