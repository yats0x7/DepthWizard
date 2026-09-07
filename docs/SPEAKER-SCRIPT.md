# DepthWizard · what to actually say
Team Eclipse · SIH 2026 · Problem Statement 26175 (ISRO)

**762 words. About 5:51 at a normal talking speed**, which fits a 6-minute slot with room to
breathe, and a 5-minute slot if you keep moving. A separate 3-minute version is at the bottom.

Two rules for delivery. **Talk, don't recite.** If a line feels stiff in your mouth, change the
words, keep the meaning. And **stop at the full stops.** The pauses are where judges catch up.

Budget: title 0:25 · idea 1:00 · technical 1:30 · feasibility 0:45 · impact 1:00 · references 0:15.
Running long? Cut a line from Impact. Never from Technical.

---

## Slide 1 · Title — 25 sec

*Don't introduce yourself yet. Start with the problem. Look at the judges, not the screen.*

> A cyclone hits the coast on a Tuesday night.
>
> By Wednesday afternoon there's a clean satellite image of the whole district. Roads, rooftops,
> the river. Everything.
>
> And nobody in that room can tell you which roads are still above the water.

*Pause. One beat. Then, lighter:*

> Because a photograph is flat. It has no height in it.
>
> That's problem statement 26175. We're Eclipse. We built the thing that fixes it, and everything
> you're about to see is a screenshot of it running.

*Advance.*

---

## Slide 2 · Idea title — 60 sec

> Right now, getting height means one of two things. You fly a LiDAR aircraft, or you pay to task
> a satellite for a stereo pair. Days. Sometimes weeks. Dedicated sensors either way.
>
> Fine for planning a highway. Useless on Wednesday afternoon.
>
> So we use the image you already have, and hand back a surface you can measure. Real metres, real
> file formats, in seconds, on a laptop.

*Now the objection. Say this like you're reading their mind, because you are.*

> Now, some of you are already thinking: AI depth models exist, this is a solved problem.
>
> They do. We use one. But look at the bottom right, because this is the part that matters. Those
> models give *relative* depth. It looks like terrain, it's beautiful, and it's unmeasurable,
> because there's no scale and no coordinates in it anywhere.
>
> We read eighteen public repositories on this exact problem statement. Some reach real metres, but
> with no viewer, so the answer sits in a file. Some have a lovely flythrough, but the heights are
> still relative, so you can't trust a number in it.

*Slow down here. This is your best sentence.*

> Not one of them had all three. Metric heights, a flythrough, and proof that it's right.
>
> That's the gap. That's what we built.

*Advance.*

---

## Slide 3 · Technical approach — 90 sec

> This is the slide I actually care about, so let me take it properly.
>
> An image comes in, and if it carries coordinates we keep them. Depth Anything V2 estimates depth
> per pixel. Big images get cut into tiles, each aligned to one pass over the whole scene, so the
> seams vanish and the scale stays honest.
>
> Then the hard part.
>
> The model gives shape, not size. It knows that roof is higher than that road. It has no idea by
> how much. So we anchor it four ways: a coarse public elevation map, a direct fit against it, a
> scene estimate when there's no map at all, or a couple of surveyed points.
>
> Out comes a GeoTIFF that opens straight in QGIS, a heightmap, a 3D mesh, and a record of exactly
> which model and method produced that number.

*Now point at the screen. Slow right down.*

> And these are real screenshots.
>
> On the left, that's the flythrough. Sun, shadows, atmosphere, because that's how a person reads
> terrain.
>
> Middle, same terrain, one keypress later. Flat light, height colours, contours, and the vertical
> exaggeration locked at exactly one, so nothing on that screen is stretched to look impressive.
>
> And on the right is the whole project in one box. Someone clicked a rooftop, and it said
> **thirty-seven point four four metres.**

*Beat.*

> That number isn't measured off the picture. It's read out of the elevation data underneath it.
> The pretty view and the measurement are the same surface. That's the promise.

*Advance.*

---

## Slide 4 · Feasibility — 45 sec

> Everything here is open and free. Open weights, open imagery, open elevation tiles. One consumer
> GPU, and it falls back to CPU if it has to. No survey hardware, no licences.
>
> Now let me get ahead of the question you're forming on the right-hand side.

*Say this straight. Don't hedge it.*

> One photograph cannot see behind a building. That's real, and no clever engineering makes it go
> away.
>
> And this is not survey grade. We don't claim it is, and the interface says so in plain words.
> This is the fast first look that tells you where to send the expensive equipment.

*Advance.*

---

## Slide 5 · Impact — 60 sec

> Back to Wednesday. The disaster team gets flood extent and blocked routes from the first clear
> image, while the survey is still days out. Planners get building heights before commissioning
> anything. Forestry gets slope without sending people into the hills.
>
> But claims are cheap, so we measured it.

*This is the credibility beat. Own it.*

> Eight scenes, four landscape types, checked against national LiDAR from the Netherlands and the
> United States. Hilly, inside three metres. Forested, four point seven. Sparse, four point five.
> Urban, six. Every scene and source published, so you can re-run it.
>
> And one thing I'd rather say than have you find: those came from ten-metre satellite pixels. At
> ten metres a house is one pixel, so the input limits that as much as the model does. Give it drone
> imagery and it sharpens right up.

*Advance.*

---

## Slide 6 · References — 15 sec

> Everything we stood on is public and cited, and the code and the benchmark are in that repository.

*Look up. Smile.*

> That's us. Ask us anything.

---

# What they'll ask

*Answer in two sentences and stop talking. The silence after a short answer reads as confidence.*

### 1. "How can one photo give you height? You're guessing."
Partly, and that's exactly why we don't trust the model alone. The AI gives shape, a public
elevation map or a surveyed point gives scale. Neither works alone; together we can check the
result against LiDAR, and we published that check.

### 2. "What's *aligned* RMSE? Why not plain RMSE?" ← learn this one properly
Aligned means we allow one fixed correction across the scene before scoring, so it's measuring
whether the shape is right. Raw error is higher, roughly three to ten metres, because on flat
ground the absolute level can drift. Both are in our benchmark file. On hills our correlation is
0.99; on flat open ground it's weak, and one ground control point fixes it.

*Say this before they dig. Volunteering it wins you more than the number costs you.*

### 3. "You didn't train a model. So what's yours?"
Correct, and we shouldn't have. Those models give relative depth with no scale and no coordinates,
so you can't measure with them. Ours is everything after that: getting to metres, geospatial
output, the viewer, and the validation.

### 4. "How's this different from Google Earth?"
Google Earth shows you places already mapped, from many images. We work on one fresh image of
somewhere that might never have been mapped, which is the disaster case. Their terms also forbid
building 3D models from their imagery, so we deliberately don't touch it.

### 5. "Can this replace LiDAR?"
No. LiDAR is survey grade and legally usable. We're the fast first look that tells you where to
send it.

### 6. "What if there's no location data, just a phone photo?"
You get relative heights. Tell it the true height of one or two points in the picture and the whole
model converts to metres.

### 7. "You can't see behind buildings. Is it really a surface model?"
It's a surface model, not a ground model. It captures what's visible from above: rooflines, canopy,
terrain. Hidden ground is a genuine limit of single-view and we say so on the feasibility slide.

### 8. "Why no Indian scene in your accuracy numbers?"
Because the Netherlands and the US publish open high-resolution LiDAR and India doesn't, at that
resolution. We used the best available truth so the numbers stay honest. The method doesn't care
where it is, and we run Indian imagery in the demo.

### 9. "Does it work offline?"
Yes. The model downloads once, then the desktop build runs with no network. Elevation tiles are
cached.

### 10. "How fast, on what?"
Twenty-six seconds for a 2500-pixel drone scene on a laptop GPU, and the viewer sits between 46 and
118 frames a second. CPU works too, slower.

### 11. "Would it handle a whole city?"
Yes, through tiling. Overlapping tiles aligned to one global pass. The limit is memory, not method.

### 12. "What does it cost to run?"
Nothing past the machine. Every model and data source we use is open, and we deliberately dropped
the sources whose licences forbid processing.

### 13. "What's next?"
Sharper benchmark scenes so the accuracy table isn't capped by ten-metre pixels, fine-tuning on
aerial elevation data, and showing per-pixel confidence in the viewer.

### 14. "Can we see it?"
Have it already open on a second machine, urban scene, Presentation mode. Switch to Analysis, click
one rooftop. Fifteen seconds, and it's the most persuasive thing you own.

---

# Before you walk in

- Fill `[Theme]` with **Disaster Management**, plus `[Team ID]` and the repository link.
- App open, job already loaded. Never run a fresh job in front of judges.
- If someone spots "affine calibration" in the screenshot: that scene was recalibrated during
  testing. Hybrid is the default. It's a setting, not a mistake.
- Whoever speaks slide 3 should be whoever knows the calibration best. That's where the real
  questions land.

---

# Short version · 3 minutes

Use this instead, not a sped-up version of the above. ~350 words, about 2:45.

**Slide 1**
> A cyclone hits on Tuesday night. By Wednesday there's a clear satellite image of the district,
> and nobody can tell you which roads are still above water. Because a photograph is flat.
>
> That's problem statement 26175. We're Eclipse, we built it, and this is it running.

**Slide 2**
> Height today means a LiDAR flight or a stereo satellite tasking. Days to weeks. Useless on
> Wednesday afternoon.
>
> You're thinking AI depth models already do this. They give you *relative* depth, which looks like
> terrain and can't be measured, because there's no scale and no coordinates in it.
>
> We read eighteen public repositories on this problem statement. Some reach metres with no viewer.
> Some have a flythrough with relative heights. Not one had metric heights, a flythrough and proof
> together. That's the gap.

**Slide 3**
> The model gives shape, not size. We anchor it to real metres four ways: a coarse elevation map, a
> direct fit, a scene estimate, or surveyed points.
>
> Out comes a GeoTIFF that opens in QGIS, a heightmap and a 3D mesh.
>
> These are real screenshots. Left, the flythrough. Middle, same terrain one keypress later, flat
> light, contours, exaggeration locked at one so nothing's stretched. Right, someone clicked a
> rooftop and it said thirty-seven point four four metres, read out of the elevation data, not off
> the picture.

**Slide 4**
> All open, all free, runs on a laptop. And the honest limits: one photo can't see behind a
> building, and this isn't survey grade. It's the fast first look that tells you where to send the
> expensive kit.

**Slide 5**
> Eight scenes, four landscape types, checked against national LiDAR. Hilly, inside three metres.
> Forested, four point seven. Sparse, four point five. Urban, six. All published so you can re-run
> it. And those came from ten-metre pixels, where a house is one pixel, so the input limits it as
> much as the model does.

**Slide 6**
> Everything's cited, code and benchmark are in the repository. That's us, ask us anything.
