| Behaviour | Model | Clips | Pangtis | WER % | CER % | CER edge-tolerant % (per-clip avg) | edge-tolerant vs Karanbir (95% CI) |
|---|---|---|---|---|---|---|---|
| Kirtan, hall laptop mic (GAB-Hard) | karanbir | 7 | 81 | 169.3 | 118.5 | 53.5 (52.1) | baseline |
| Kirtan, hall laptop mic (GAB-Hard) | jaspal-v0 | 7 | 81 | 131.0 | 93.3 | 70.6 (69.3) | +17.2 [15.0, 20.1] clear |
| Kirtan, hall laptop mic (GAB-Hard) | jaspal-v1 | 7 | 81 | 185.3 | 122.1 | 66.5 (65.8) | +13.0 [10.2, 17.3] clear |
| Kirtan, hall laptop mic (GAB-Hard) | jaspal-v2 | 7 | 81 | 171.5 | 119.0 | 59.9 (58.1) | +6.4 [3.5, 8.8] clear |
| Paath (studio) | karanbir | 2 | 43 | 78.4 | 46.4 | 27.1 (26.9) | baseline |
| Paath (studio) | jaspal-v0 | 2 | 43 | 93.1 | 64.5 | 51.9 (52.0) | too few clips |
| Paath (studio) | jaspal-v1 | 2 | 43 | 90.5 | 59.8 | 43.7 (43.8) | too few clips |
| Paath (studio) | jaspal-v2 | 2 | 43 | 72.4 | 47.5 | 30.4 (30.3) | too few clips |
| Bani sung as kirtan | karanbir | 1 | 44 | 86.3 | 48.6 | 34.9 (34.9) | baseline |
| Bani sung as kirtan | jaspal-v0 | 1 | 44 | 97.6 | 74.0 | 69.5 (69.5) | too few clips |
| Bani sung as kirtan | jaspal-v1 | 1 | 44 | 93.2 | 64.2 | 57.7 (57.7) | too few clips |
| Bani sung as kirtan | jaspal-v2 | 1 | 44 | 82.2 | 51.4 | 39.5 (39.5) | too few clips |
| Akhand Paath (natural speed) | karanbir | 4 | 269 | 63.1 | 32.3 | 14.3 (14.2) | baseline |
| Akhand Paath (natural speed) | jaspal-v0 | 4 | 269 | 57.2 | 32.5 | 18.9 (18.7) | +4.6 [2.5, 6.4] too few clips to call |
| Akhand Paath (natural speed) | jaspal-v1 | 4 | 269 | 52.1 | 28.6 | 14.3 (14.1) | -0.1 [-1.9, 1.5] too few clips to call |
| Akhand Paath (natural speed) | jaspal-v2 | 4 | 269 | 50.8 | 29.5 | 12.5 (12.2) | -1.8 [-3.4, 0.1] too few clips to call |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | karanbir | 2 | 179 | 75.2 | 43.2 | 23.7 (24.0) | baseline |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | jaspal-v0 | 2 | 179 | 80.0 | 51.2 | 41.8 (42.5) | too few clips |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | jaspal-v1 | 2 | 179 | 77.5 | 46.1 | 35.8 (36.3) | too few clips |
| Akhand Paath sped up 1.35x (synthetic; one clip repeats a natural-speed clip) | jaspal-v2 | 2 | 179 | 73.7 | 45.4 | 30.1 (30.5) | too few clips |

Edge-tolerant CER is the headline; plain WER / CER on exact label times count repeated singing and late captions as errors. Only behaviours with human or broadcast-caption pangti times appear: kirtan (mixer feed), Akhand Kirtan and paath (hall) have only model-aligned times, so they are left out. Rows with 1-2 clips are examples, not evidence. Pangtis are scored inside the same [start, end] of each clip as hit@5, so the longer recordings contribute only that part. Pangtis over 20 s (39 of 81 on hall kirtan) are cut into equal parts for every model.
