import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlaceSearch } from "@/components/search";
import { api } from "@/lib/api";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
it("searches a provider and supports keyboard selection", async () => {
  const place = {
    name: "Jammu",
    country: "India",
    latitude: 32.73,
    longitude: 74.87,
  };
  vi.mocked(api).mockResolvedValue([place]);
  const select = vi.fn();
  render(<PlaceSearch onSelect={select} />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "Jammu" } });
  await screen.findByRole("option");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledWith(place);
  expect(input).toHaveAttribute("aria-expanded", "false");
});
it("displays provider failure without invented search results", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Provider unavailable"));
  render(<PlaceSearch onSelect={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "Jammu" },
  });
  await screen.findByText("Provider unavailable");
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});
