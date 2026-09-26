import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scopeEstimate } from "@/lib/estimate/scope";
import { northgateEstimate as est } from "@/lib/fixtures";
import messages from "../../../messages/en.json";
import { EstimateTab } from "./estimate-tab";
import { LineItemsTab } from "./line-items-tab";

// Smoke test: tabs render the Northgate fixture with no missing strings.

function render(el: ReactElement) {
  const errors: string[] = [];
  const html = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "America/Toronto",
      onError: (e) => errors.push(e.message),
      children: el,
    }),
  );
  return { html, errors };
}

describe("estimate panel tabs", () => {
  for (const id of [null, est.components[0]!.componentId]) {
    const scoped = scopeEstimate(est, id);
    const scope = id ? "one component" : "whole project";

    it(`Estimate tab renders (${scope})`, () => {
      const { html, errors } = render(
        createElement(EstimateTab, { estimate: est, scoped }),
      );
      expect(errors).toEqual([]);
      expect(html).toContain(`Class ${scoped.estimateClass} estimate`);
      if (!id) expect(html).toContain("Overrun risk");
    });

    it(`Line items tab renders (${scope})`, () => {
      const { html, errors } = render(
        createElement(LineItemsTab, { estimate: est, scoped }),
      );
      expect(errors).toEqual([]);
      expect(html).toContain(scoped.lineItems[0]!.description.en);
    });
  }
});
