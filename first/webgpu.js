const GRID_SIZE = 11
const start = Date.now()

const canvas = document.querySelector("canvas")
const fps_display = document.querySelector('#fps')
let last_time = 0
let frame_count = 0
function setfps(x) {
	fps_display.textContent = x + " FPS"
}

canvas.height = window.innerHeight - 40
canvas.width = window.innerWidth - 10
if (!navigator.gpu) {
	console.error("WebGPU is not supported in this browser.")
}

(async () => {
	const adaptor = await navigator.gpu.requestAdapter()
	const device = await adaptor.requestDevice()
	const context = canvas.getContext("webgpu")
	const format = navigator.gpu.getPreferredCanvasFormat()

	const vertexBufferLayout = {
		arrayStride: 8,
		attributes: [{
			format: "float32x2",
			offset: 0,
			shaderLocation: 0, // Position, see vertex shader
		}],
	};

	// Create a uniform buffer that describes the grid.
	const uniformArray = new ArrayBuffer(16);
	const uniformArray_floats = new Float32Array(uniformArray);
	//const uniformArray_ints = new Int32Array(uniformArray);

	uniformArray_floats[2] = GRID_SIZE
	uniformArray_floats[3] = GRID_SIZE
	uniformArray_floats[0] = (window.innerWidth / window.innerHeight)
	uniformArray_floats[1] = 1

	console.log(uniformArray_floats)

	const uniformBuffer = device.createBuffer({
		label: "Grid Uniforms",
		size: uniformArray.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

	const cellShaderModule = device.createShaderModule({
		label: "Cell shader",
		code: `
struct Uniforms {
    aspect_ratio: vec2f,
    grid: vec2f
};

@group(0) @binding(0)
var<uniform> u: Uniforms;

// Idea for both x and y
// 0 -> 10, -1 -> 1
fn map_coord(x: vec2f) -> vec2f {
	return (x * 2 / u.grid) - 1;
}

struct VertexInput {
	@location(0) pos: vec2f
};
struct VertexOutput {
	@builtin(position) out_pos: vec4f,
	@location(0) idk_what: vec2f
};

@vertex
fn vertexMain(i: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.out_pos = vec4f(map_coord(i.pos) / u.aspect_ratio, 1, 1);
  output.idk_what = i.pos / u.grid;
  return output;
}

@fragment
fn fragmentMain(@location(0) idk_what: vec2f) -> @location(0) vec4f {
  return vec4f(idk_what, (idk_what.x + idk_what.y) / 2, 1);
}`
	});
	const cellPipeline = device.createRenderPipeline({
		label: "Cell pipeline",
		layout: "auto",
		vertex: {
			module: cellShaderModule,
			entryPoint: "vertexMain",
			buffers: [vertexBufferLayout]
		},
		fragment: {
			module: cellShaderModule,
			entryPoint: "fragmentMain",
			targets: [{
				format: format
			}]
		}
	});

	const bindGroup = device.createBindGroup({
		label: "Cell renderer bind group",
		layout: cellPipeline.getBindGroupLayout(0),
		entries: [{
			binding: 0,
			resource: { buffer: uniformBuffer }
		}],
	});

	context.configure({
		device: device,
		format: format,
	})

	render()
	function render() {
		setTimeout(render, 0)

		frame_count++;
		if (Date.now() - last_time > 1000) {
			setfps(frame_count);
			frame_count = 0;
			last_time = Date.now()
		}

		const encoder = device.createCommandEncoder()
		const pass = encoder.beginRenderPass({
			colorAttachments: [{
				view: context.getCurrentTexture().createView(),
				loadOp: "clear",
				clearValue: { r: 0.1, g: 0.6, b: 0.1, a: 1 },
				storeOp: "store",
			}],
		});

		const vertices = new Float32Array(GRID_SIZE * GRID_SIZE * 6 + 6);
		let counter = 0
		function draw_square(x, y) {
			let i = counter * 12;
			counter++;

			// Triangle 1
			vertices[i] = x
			vertices[++i] = y
			vertices[++i] = x
			vertices[++i] = y + 1
			vertices[++i] = x + 1
			vertices[++i] = y

			// Triangle 2
			vertices[++i] = x + 1
			vertices[++i] = y + 1
			vertices[++i] = x + 1
			vertices[++i] = y
			vertices[++i] = x
			vertices[++i] = y + 1
		}

		for (i = 0; i < GRID_SIZE * GRID_SIZE; i += 2) {
			x = i % GRID_SIZE
			y = Math.floor(i / GRID_SIZE)
			draw_square(x, y)
		}

		const vertexBuffer = device.createBuffer({
			label: "Cell vertices",
			size: vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(vertexBuffer, 0, vertices);

		pass.setPipeline(cellPipeline);
		pass.setVertexBuffer(0, vertexBuffer);
		pass.setBindGroup(0, bindGroup);
		pass.draw(vertices.length / 2);

		pass.end()
		device.queue.submit([encoder.finish()])
	}
})()
