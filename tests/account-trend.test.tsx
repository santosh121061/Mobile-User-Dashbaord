import React from "react";
import { render } from "@testing-library/react-native";
import { Polyline } from "react-native-svg";
import { AccountTrend, trendPoints } from "../src/features/account-trend";

const days = (counts: number[]) =>
    counts.map((count, index) => ({
        date: `2026-10-${index + 1}`,
        label: `Day ${index + 1}`,
        count,
    }));

it("preserves chronological order and relative daily counts without inventing a trend", () => {
    const points = trendPoints(days([0, 2, 4]))!
        .split(" ")
        .map((point) => point.split(",").map(Number));
    expect(points).toEqual([
        [3, 69],
        [150, 36],
        [297, 3],
    ]);
});

it("keeps zero-only and single-day series finite and bounded", () => {
    expect(trendPoints(days([0, 0, 0]))).toBe(
        "3.00,69.00 150.00,69.00 297.00,69.00",
    );
    expect(trendPoints(days([4]))).toBe("150.00,3.00");
    expect(
        trendPoints(days(Array.from({ length: 30 }, (_, index) => index))),
    ).not.toMatch(/NaN|Infinity/);
});

it("omits empty, oversized or invalid series instead of drawing fabricated zeroes", () => {
    for (const input of [[], [-1], [NaN], [Infinity], Array(31).fill(1)])
        expect(trendPoints(days(input))).toBeNull();
});

it("renders one lightweight decorative SVG and leaves exact labelled values to Home", () => {
    const screen = render(<AccountTrend days={days([0, 2, 4])} />);
    const chart = screen.getByTestId("account-trend", {
        includeHiddenElements: true,
    });
    expect(chart.props.accessible).toBe(false);
    expect(chart.props.accessibilityElementsHidden).toBe(true);
    expect(chart.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.UNSAFE_getByType(Polyline).props.points).toBe(
        "3.00,69.00 150.00,36.00 297.00,3.00",
    );
    screen.rerender(<AccountTrend days={[]} />);
    expect(
        screen.queryByTestId("account-trend", { includeHiddenElements: true }),
    ).toBeNull();
});
