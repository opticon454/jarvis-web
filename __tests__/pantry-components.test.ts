/**
 * The Pantry returns each component of a bundle as an object ({ type, name, path }).
 * The package page used to render the component itself, and React cannot render an
 * object, so every bundle with more than one component ended in "This page couldn't load".
 */

import { componentName, PantryCommandDetail } from "@/lib/api";

describe("componentName", () => {
  it("returns the name of an object component", () => {
    expect(componentName({ type: "agent", name: "weather_context", path: "agents/weather_context/agent.py" })).toBe(
      "weather_context",
    );
  });

  it("accepts a component given as a plain name", () => {
    expect(componentName("get_weather")).toBe("get_weather");
  });

  it("gives every component of a bundle a renderable string", () => {
    const bundle: Pick<PantryCommandDetail, "components"> = {
      components: [
        { type: "command", name: "get_weather_meteo", path: "commands/get_weather/command.py" },
        { type: "agent", name: "weather_context", path: "agents/weather_context/agent.py" },
      ],
    };

    expect(bundle.components.map(componentName)).toEqual(["get_weather_meteo", "weather_context"]);
  });
});
