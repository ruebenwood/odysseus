import { render, screen } from "@testing-library/react";

function Hello({ name = "world" }: { name?: string }) {
  return <div>Hello {name}</div>;
}

test("renders greeting", () => {
  render(<Hello name="Odysseus" />);
  expect(screen.getByText("Hello Odysseus")).toBeInTheDocument();
});
