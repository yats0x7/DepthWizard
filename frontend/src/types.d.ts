declare module '@mapbox/martini' {
  export default class Martini {
    constructor(gridSize?: number)
    createTile(terrain: ArrayLike<number>): {
      getMesh(maxError?: number): { vertices: Uint16Array; triangles: Uint32Array }
    }
  }
}
